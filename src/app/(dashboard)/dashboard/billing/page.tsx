import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { missingLegalDetails } from "@/lib/invoice-legal";
import { regionConfig } from "@/lib/regions";
import { ensureWorkspace } from "@/lib/workspace";
import { formatMoney, langOf, localeOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { makeI18n, toLang } from "@/i18n/core";
import type { MessageKey } from "@/i18n/messages";
import { BillingTable, type InvoiceRow } from "@/components/billing/billing-table";
import { StatCard } from "@/components/billing/stat-card";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

const FILTERS = {
  all: { label: "billing.filter.all", where: {} },
  unpaid: { label: "billing.filter.unpaid", where: { kind: "INVOICE", status: { in: ["DRAFT", "SENT"] } } },
  overdue: { label: "billing.filter.overdue", where: { status: "OVERDUE" } },
  paid: { label: "billing.filter.paid", where: { kind: "INVOICE", status: "PAID" } },
  credit: { label: "billing.filter.credit", where: { OR: [{ kind: "CREDIT_NOTE" }, { status: "CANCELLED" }] } },
} satisfies Record<string, { label: MessageKey; where: Prisma.InvoiceWhereInput }>;
type FilterKey = keyof typeof FILTERS;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const params = await searchParams;
  const filter: FilterKey = params.status && params.status in FILTERS ? (params.status as FilterKey) : "all";
  const page = Math.max(1, Number(params.page) || 1);

  const workspace = await prisma.workspace.findUnique({
    where: { id: userId },
    select: {
      currency: true,
      region: true,
      language: true,
      address: true,
      vatMention: true,
      permitNumber: true,
      neq: true,
      gstNumber: true,
      qstNumber: true,
      siret: true,
      adeli: true,
      rpps: true,
    },
  });
  const missingLegal = workspace ? missingLegalDetails(workspace) : [];
  const currency = workspace?.currency ?? "CAD";
  const locale = localeOf(langOf(workspace?.language), workspace?.region);
  const money = (n: number) => formatMoney(n, currency, locale);
  const { t } = makeI18n(toLang(workspace?.language), locale);

  const where: Prisma.InvoiceWhereInput = { workspaceId: userId, ...FILTERS[filter].where };
  const [invoices, filteredCount, stats, collected, years] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { workspaceId: userId, kind: "INVOICE" },
      _sum: { totalAmount: true },
      _count: true,
    }),
    // Money received: paid invoices, less refunds (credit notes of paid invoices)
    prisma.invoice.aggregate({
      where: { workspaceId: userId, paidAt: { not: null } },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.findFirst({
      where: { workspaceId: userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const statMap = Object.fromEntries(
    stats.map((s) => [s.status, { sum: Number(s._sum.totalAmount ?? 0), count: s._count }])
  );

  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    patientName: `${inv.patient.lastName}, ${inv.patient.firstName}`,
    totalAmount: Number(inv.totalAmount),
    kind: inv.kind,
    status: inv.status,
    dueDate: inv.dueDate.toISOString(),
    sentAt: inv.sentAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    receiptSentAt: inv.receiptSentAt?.toISOString() ?? null,
    publicToken: inv.publicToken,
  }));

  const revenue = Number(collected._sum.totalAmount ?? 0);
  const outstanding = (statMap["SENT"]?.sum ?? 0) + (statMap["DRAFT"]?.sum ?? 0);
  const overdue = statMap["OVERDUE"]?.sum ?? 0;
  const totalInvoices = Object.entries(statMap)
    .filter(([status]) => status !== "CANCELLED")
    .reduce((acc, [, v]) => acc + v.count, 0);

  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const href = (f: FilterKey, p = 1) =>
    `/dashboard/billing?${new URLSearchParams({ ...(f !== "all" && { status: f }), ...(p > 1 && { page: String(p) }) })}`;

  const thisYear = new Date().getFullYear();
  const firstYear = years?.createdAt.getFullYear() ?? thisYear;
  const exportYears = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i);

  return (
    <>
      <Header title={t("nav.billing")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-6">

          {missingLegal.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p>{t("billing.missingLegal", { list: missingLegal.map((m) => t(m)).join(", ") })}</p>
              <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
                {t("billing.completeInSettings")}
              </Link>
            </div>
          )}

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("billing.stat.total")} value={String(totalInvoices)} />
            <StatCard label={t("billing.stat.revenue")} value={money(revenue)} highlight="green" />
            <StatCard label={t("billing.stat.outstanding")} value={money(outstanding)} />
            <StatCard label={t("billing.stat.overdue")} value={money(overdue)} highlight={overdue > 0 ? "red" : undefined} />
          </div>

          {/* Invoice table */}
          <div className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold">{t("billing.invoices")}</h2>
                <Button size="sm" render={<Link href="/dashboard/billing/new" />}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("billing.new")}
                </Button>
              </div>
              <nav className="flex flex-wrap gap-1">
                {(Object.keys(FILTERS) as FilterKey[]).map((f) => (
                  <Link
                    key={f}
                    href={href(f)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      f === filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t(FILTERS[f].label)}
                  </Link>
                ))}
              </nav>
            </div>
            <BillingTable rows={rows} currency={currency} locale={locale} creditNoteLabel={regionConfig(workspace?.region).creditNoteTitle} />
            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                <span className="text-muted-foreground">
                  {t("billing.pageInfo", { page, count: pageCount, total: filteredCount })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    render={page > 1 ? <Link href={href(filter, page - 1)} /> : undefined}
                  >
                    {t("common.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    render={page < pageCount ? <Link href={href(filter, page + 1)} /> : undefined}
                  >
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Accounting export */}
          <div className="rounded-xl border bg-card px-5 py-4">
            <h2 className="font-semibold">{t("billing.export")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("billing.exportHint")}</p>
            <form action="/api/export/invoices" method="get" className="mt-3 flex flex-wrap items-center gap-2">
              <select
                name="year"
                defaultValue={thisYear}
                aria-label={t("billing.year")}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {exportYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <Button type="submit" name="kind" value="invoices" variant="outline" size="sm">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("billing.exportInvoices")}
              </Button>
              <Button type="submit" name="kind" value="monthly" variant="outline" size="sm">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("billing.exportMonthly")}
              </Button>
            </form>
          </div>

        </div>
      </main>
    </>
  );
}
