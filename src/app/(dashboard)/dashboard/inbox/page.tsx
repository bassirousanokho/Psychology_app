import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { ConversationList } from "@/components/inbox/conversation-list";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { formatMoney } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

type ActivityData = { start?: string; previousStart?: string | null; fee?: number | null; name?: string; signed?: boolean };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");
  const tab = (await searchParams).tab === "activity" ? "activity" : "messages";
  const i18n = await getI18n(userId);
  const { t, fmt } = i18n;

  const [unreadActivity, unreadMessages] = await Promise.all([
    prisma.activity.count({ where: { workspaceId: userId, readAt: null } }),
    prisma.message.count({ where: { workspaceId: userId, direction: "FROM_PATIENT", readAt: null } }),
  ]);

  let activity: Awaited<ReturnType<typeof loadActivity>> = [];
  if (tab === "activity") {
    activity = await loadActivity(userId);
    // Seen now: unread ones stay highlighted on this view
    await prisma.activity.updateMany({ where: { workspaceId: userId, readAt: null }, data: { readAt: new Date() } });
  }
  const ws = tab === "activity" ? await prisma.workspace.findUniqueOrThrow({ where: { id: userId }, select: { currency: true, language: true, region: true } }) : null;

  const tabLink = (key: "messages" | "activity", label: string, count: number) => (
    <Link
      href={key === "messages" ? "/dashboard/inbox" : "/dashboard/inbox?tab=activity"}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      {count > 0 && <span className="rounded-full bg-destructive px-1.5 text-[10px] text-white">{count}</span>}
    </Link>
  );

  return (
    <>
      <Header title={t("nav.inbox")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <nav className="flex gap-1">
            {tabLink("messages", t("inbox.tab.messages"), unreadMessages)}
            {tabLink("activity", t("inbox.tab.activity"), unreadActivity)}
          </nav>

          {tab === "messages" ? (
            <div className="rounded-xl border bg-card">
              <ConversationList workspaceId={userId} i18n={i18n} />
            </div>
          ) : (
            <div className="rounded-xl border bg-card">
              {activity.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">{t("inbox.noActivity")}</p>
              ) : (
                <ul className="divide-y">
                  {activity.map((a) => {
                    const d = (a.data ?? {}) as ActivityData;
                    const name = a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "—";
                    const when = d.start ? fmt(d.start, "EEE d MMM, HH:mm") : "";
                    const fee = d.fee && ws ? formatMoney(d.fee, ws.currency, i18n.locale) : null;
                    const text =
                      a.type === "BOOKED"
                        ? t("activity.booked", { name, when })
                        : a.type === "MOVED"
                        ? t("activity.moved", { name, when, from: d.previousStart ? fmt(d.previousStart, "EEE d MMM, HH:mm") : "" })
                        : a.type === "CANCELLED"
                        ? t("activity.cancelled", { name, when }) + (fee ? ` ${t("activity.fee", { amount: fee })}` : "")
                        : t("activity.form", { name, form: d.name ?? "" }) + (d.signed ? ` ${t("activity.signed")}` : "");
                    const href =
                      a.type === "FORM_COMPLETED" && a.formRequestId
                        ? `/dashboard/forms/responses/${a.formRequestId}`
                        : a.appointmentId
                        ? `/dashboard/appointments/${a.appointmentId}`
                        : a.patientId
                        ? `/dashboard/patients/${a.patientId}`
                        : "#";
                    return (
                      <li key={a.id}>
                        <Link href={href} className={cn("flex items-start gap-3 px-5 py-3 hover:bg-muted/40", !a.readAt && "bg-primary/5")}>
                          {!a.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                          <p className="flex-1 text-sm">{text}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">{fmt(a.createdAt, "d MMM, HH:mm")}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function loadActivity(workspaceId: string) {
  return prisma.activity.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
}
