import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/tenant";
import { ensureWorkspace } from "@/lib/workspace";
import { isHourly } from "@/lib/session-types";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 25;
const MAX_SEARCHED = 2000; // notes decrypted per search (encrypted at rest, so filtered in memory)
const EXCERPT = 180;

const TABS = {
  missing: "notes.tab.missing",
  drafts: "notes.tab.drafts",
  completed: "notes.tab.completed",
  all: "notes.tab.all",
} as const;
type Tab = keyof typeof TABS;

type SearchParams = { tab?: string; patient?: string; from?: string; to?: string; q?: string; page?: string };

export default async function NotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const params = await searchParams;
  const { t, tp, fmt } = await getI18n(userId);
  const tab: Tab = params.tab && params.tab in TABS ? (params.tab as Tab) : "missing";
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = params.from && dateRe.test(params.from) ? params.from : "";
  const to = params.to && dateRe.test(params.to) ? params.to : "";

  const now = new Date();
  const where: Prisma.AppointmentWhereInput = {
    workspaceId: userId,
    status: { notIn: ["CANCELLED", "NO_SHOW"] },
    ...(params.patient && { patientId: params.patient }),
    ...((from || to) && {
      startTime: {
        ...(from && { gte: new Date(`${from}T00:00:00`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999`) }),
      },
    }),
  };
  if (tab === "missing") Object.assign(where, { type: "PSYCHOTHERAPY", noteCompletedAt: null, endTime: { lt: now } });
  if (tab === "drafts") Object.assign(where, { noteCompletedAt: null, sessionNotes: { not: null } });
  if (tab === "completed") Object.assign(where, { noteCompletedAt: { not: null } });

  const select = {
    id: true,
    startTime: true,
    endTime: true,
    status: true,
    type: true,
    sessionNotes: true,
    noteCompletedAt: true,
    patient: { select: { firstName: true, lastName: true, deletedAt: true } },
    _count: { select: { documents: { where: { isSessionNote: true } } } },
  } satisfies Prisma.AppointmentSelect;

  // Notes are encrypted, so text search (and the "drafts" check for non-empty
  // drafts) decrypts in memory over the filtered sessions
  const needsDecryptFilter = q !== "" || tab === "drafts";
  let rows;
  let total;
  if (needsDecryptFilter) {
    const candidates = await prisma.appointment.findMany({
      where,
      select,
      orderBy: { startTime: "desc" },
      take: MAX_SEARCHED,
    });
    const needle = q.toLocaleLowerCase();
    const matched = candidates
      .map((a) => ({ ...a, text: decrypt(a.sessionNotes) ?? "" }))
      .filter((a) => (tab !== "drafts" || a.text.trim() !== "") && (!needle || a.text.toLocaleLowerCase().includes(needle)));
    total = matched.length;
    rows = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    const [list, count] = await Promise.all([
      prisma.appointment.findMany({
        where,
        select,
        orderBy: { startTime: tab === "missing" ? "asc" : "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.appointment.count({ where }),
    ]);
    rows = list.map((a) => ({ ...a, text: decrypt(a.sessionNotes) ?? "" }));
    total = count;
  }

  const patients = await prisma.patient.findMany({
    where: { workspaceId: userId },
    select: { id: true, firstName: true, lastName: true, deletedAt: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  audit({
    workspaceId: userId,
    userId,
    action: "VIEW_NOTES_LIST",
    resourceType: "Appointment",
    resourceId: "notes-list",
    metadata: { tab, patientId: params.patient ?? null, searched: q !== "", shown: rows.length },
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (overrides: Partial<SearchParams>) => {
    const merged = { tab, patient: params.patient, from, to, q, ...overrides };
    const sp = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
    );
    return `/dashboard/notes?${sp}`;
  };

  return (
    <>
      <Header title={t("nav.notes")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-1">
            {(Object.keys(TABS) as Tab[]).map((tb) => (
              <Link
                key={tb}
                href={link({ tab: tb, page: undefined })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tb === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t(TABS[tb])}
              </Link>
            ))}
          </nav>
            <Button variant="outline" size="sm" render={<Link href="/dashboard/notes/templates" />}>
              {t("noteTemplates.title")}
            </Button>
          </div>

          {/* Filters */}
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <input type="hidden" name="tab" value={tab} />
            <div className="space-y-1">
              <label htmlFor="f-patient" className="text-xs font-medium text-muted-foreground">{t("notes.patient")}</label>
              <select
                id="f-patient"
                name="patient"
                defaultValue={params.patient ?? ""}
                className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{t("notes.allPatients")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                    {p.deletedAt ? ` ${t("common.deletedTag")}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="f-from" className="text-xs font-medium text-muted-foreground">{t("common.from")}</label>
              <Input id="f-from" type="date" name="from" defaultValue={from} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <label htmlFor="f-to" className="text-xs font-medium text-muted-foreground">{t("common.to")}</label>
              <Input id="f-to" type="date" name="to" defaultValue={to} className="h-9 w-40" />
            </div>
            <div className="flex-1 min-w-48 space-y-1">
              <label htmlFor="f-q" className="text-xs font-medium text-muted-foreground">{t("notes.search")}</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="f-q" name="q" defaultValue={q} placeholder={t("notes.searchPlaceholder")} className="h-9 pl-8" />
              </div>
            </div>
            <Button type="submit" size="sm" className="h-9">{t("common.apply")}</Button>
            {(params.patient || from || to || q) && (
              <Button variant="ghost" size="sm" className="h-9" render={<Link href={link({ patient: "", from: "", to: "", q: "", page: undefined })} />}>
                {t("common.clear")}
              </Button>
            )}
          </form>

          {/* Results */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3 text-sm text-muted-foreground">
              {tp(total, "notes.count")}
              {total >= MAX_SEARCHED && needsDecryptFilter && t("notes.limited")}
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {tab === "missing" ? t("notes.allDocumented") : t("notes.noMatch")}
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((a) => (
                  <li key={a.id}>
                    <Link href={`/dashboard/appointments/${a.id}`} className="flex gap-4 px-5 py-3 hover:bg-muted/40">
                      <div className="w-28 shrink-0 text-sm">
                        <p className="font-medium">{fmt(a.startTime, "d MMM yyyy")}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(a.startTime, "HH:mm")}–{fmt(a.endTime, "HH:mm")}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {a.patient.lastName}, {a.patient.firstName}
                          {a.patient.deletedAt && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("common.deletedTag")}</span>}
                          {isHourly(a.type) && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">{t(`type.${a.type}`)}</span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {a.text.trim()
                            ? a.text.trim().slice(0, EXCERPT) + (a.text.trim().length > EXCERPT ? "…" : "")
                            : a._count.documents > 0
                            ? tp(a._count.documents, "notes.files")
                            : <span className="italic">{t("notes.noNotes")}</span>}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {a.noteCompletedAt ? (
                          <Badge>{t("notes.badge.completed")}</Badge>
                        ) : a.text.trim() ? (
                          <Badge variant="secondary">{t("notes.badge.draft")}</Badge>
                        ) : a.endTime < now ? (
                          <Badge variant="destructive">{t("notes.badge.missing")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("notes.badge.upcoming")}</Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                <span className="text-muted-foreground">{t("common.pageOf", { page, count: pageCount })}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} render={page > 1 ? <Link href={link({ page: String(page - 1) })} /> : undefined}>
                    {t("common.previous")}
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pageCount} render={page < pageCount ? <Link href={link({ page: String(page + 1) })} /> : undefined}>
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
