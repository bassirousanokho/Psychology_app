import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { addMonths, differenceInCalendarDays, startOfMonth } from "date-fns";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/billing/stat-card";
import { BarChart } from "@/components/reports/bar-chart";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

const AGING = [
  { max: 30, key: "reports.aging.0" },
  { max: 60, key: "reports.aging.30" },
  { max: 90, key: "reports.aging.60" },
  { max: Infinity, key: "reports.aging.90" },
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const { t, tp, fmt, money: formatMoney } = await getI18n(userId);
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
  const money = (n: number) => formatMoney(n, ws.currency);
  const moneyShort = (n: number) => formatMoney(Math.round(n), ws.currency).replace(/[.,]00(?=\D*$)/, "");

  // Period: the last 12 months (default) or a calendar year
  const now = new Date();
  const param = (await searchParams).period ?? "12m";
  const year = /^\d{4}$/.test(param) ? Number(param) : null;
  const from = year ? new Date(year, 0, 1) : startOfMonth(addMonths(now, -11));
  const to = year ? new Date(year + 1, 0, 1) : startOfMonth(addMonths(now, 1));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(from, i));
  const monthIndex = (d: Date) => (d.getFullYear() - from.getFullYear()) * 12 + d.getMonth() - from.getMonth();

  const [appointments, paid, issued, newPatients, unpaid, firstInvoice] = await Promise.all([
    prisma.appointment.findMany({
      where: { workspaceId: userId, startTime: { gte: from, lt: to } },
      select: { startTime: true, status: true, type: true, tariffAmount: true, patientId: true },
    }),
    prisma.invoice.findMany({
      where: { workspaceId: userId, paidAt: { gte: from, lt: to } },
      select: { paidAt: true, totalAmount: true, patientId: true },
    }),
    prisma.invoice.findMany({
      where: { workspaceId: userId, createdAt: { gte: from, lt: to } },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.patient.findMany({
      where: { workspaceId: userId, createdAt: { gte: from, lt: to } },
      select: { createdAt: true },
    }),
    prisma.invoice.findMany({
      where: { workspaceId: userId, kind: "INVOICE", status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
      select: { dueDate: true, totalAmount: true },
    }),
    prisma.invoice.findFirst({ where: { workspaceId: userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  // ── Money ──
  const collectedByMonth = months.map(() => 0);
  const invoicedByMonth = months.map(() => 0);
  for (const p of paid) collectedByMonth[monthIndex(p.paidAt!)] += Number(p.totalAmount);
  for (const i of issued) invoicedByMonth[monthIndex(i.createdAt)] += Number(i.totalAmount);
  const collected = collectedByMonth.reduce((a, b) => a + b, 0);
  const invoiced = invoicedByMonth.reduce((a, b) => a + b, 0);

  // ── Sessions (therapy) ──
  const therapy = appointments.filter((a) => a.type === "PSYCHOTHERAPY" && a.startTime < now);
  const byStatus = (status: string) => months.map((_, m) => therapy.filter((a) => a.status === status && monthIndex(a.startTime) === m).length);
  const completedByMonth = byStatus("COMPLETED");
  const cancelledByMonth = byStatus("CANCELLED");
  const noShowByMonth = byStatus("NO_SHOW");
  const completed = completedByMonth.reduce((a, b) => a + b, 0);
  const cancelled = cancelledByMonth.reduce((a, b) => a + b, 0);
  const noShows = noShowByMonth.reduce((a, b) => a + b, 0);
  const held = therapy.filter((a) => a.status === "COMPLETED");
  const cancellationRate = completed + cancelled + noShows > 0 ? (cancelled + noShows) / (completed + cancelled + noShows) : 0;
  const averagePrice = held.length ? held.reduce((s, a) => s + Number(a.tariffAmount), 0) / held.length : 0;
  const activePatients = new Set(held.map((a) => a.patientId)).size;

  // Busiest weekdays (completed therapy sessions)
  const weekdays = [1, 2, 3, 4, 5, 6, 0];
  const byWeekday = weekdays.map((d) => held.filter((a) => a.startTime.getDay() === d).length);

  // ── Patients ──
  const newByMonth = months.map(() => 0);
  for (const p of newPatients) newByMonth[monthIndex(p.createdAt)]++;

  // Top patients by money received in the period
  const byPatient = new Map<string, number>();
  for (const p of paid) byPatient.set(p.patientId, (byPatient.get(p.patientId) ?? 0) + Number(p.totalAmount));
  const topIds = [...byPatient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topNames = await prisma.patient.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, firstName: true, lastName: true },
  });

  // ── Unpaid invoices by days past due ──
  const aging = AGING.map(() => ({ count: 0, total: 0 }));
  for (const inv of unpaid) {
    const late = Math.max(0, differenceInCalendarDays(now, inv.dueDate));
    const bucket = AGING.findIndex((b) => late <= b.max);
    aging[bucket].count++;
    aging[bucket].total += Number(inv.totalAmount);
  }

  const labels = months.map((m) => fmt(m, "MMM"));
  const thisYear = now.getFullYear();
  const firstYear = Math.min(thisYear, firstInvoice?.createdAt.getFullYear() ?? thisYear);
  const periods = [
    { key: "12m", label: t("reports.last12") },
    ...Array.from({ length: thisYear - firstYear + 1 }, (_, i) => ({ key: String(thisYear - i), label: String(thisYear - i) })),
  ];
  const current = year ? String(year) : "12m";

  return (
    <>
      <Header title={t("nav.reports")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {fmt(from, "d MMM yyyy")} – {fmt(to.getTime() - 1, "d MMM yyyy")}
            </p>
            <nav className="flex flex-wrap gap-1">
              {periods.map((p) => (
                <Link
                  key={p.key}
                  href={`/dashboard/reports?period=${p.key}`}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    p.key === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("reports.collected")} value={money(collected)} highlight="green" />
            <StatCard label={t("reports.sessions")} value={String(completed)} />
            <StatCard label={t("reports.cancellationRate")} value={`${Math.round(cancellationRate * 100)} %`} highlight={cancellationRate > 0.2 ? "red" : undefined} />
            <StatCard label={t("reports.activePatients")} value={String(activePatients)} />
          </div>

          <section className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{t("reports.revenue")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("reports.invoicedTotal", { amount: money(invoiced) })} · {t("reports.averagePrice", { amount: money(averagePrice) })}
              </p>
            </div>
            <BarChart
              labels={labels}
              format={money}
              series={[
                { label: t("reports.invoiced"), className: "bg-slate-300 dark:bg-slate-600", values: invoicedByMonth },
                { label: t("reports.collected"), className: "bg-green-500", values: collectedByMonth },
              ]}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 font-semibold">{t("reports.sessionsByMonth")}</h2>
              <BarChart
                labels={labels}
                stacked
                format={(n) => String(n)}
                series={[
                  { label: t("status.COMPLETED"), className: "bg-blue-500", values: completedByMonth },
                  { label: t("status.CANCELLED"), className: "bg-gray-300 dark:bg-gray-600", values: cancelledByMonth },
                  { label: t("status.NO_SHOW"), className: "bg-red-400", values: noShowByMonth },
                ]}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {tp(cancelled, "reports.cancelledCount")} · {tp(noShows, "reports.noShowCount")}
              </p>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 font-semibold">{t("reports.newPatients")}</h2>
              <BarChart
                labels={labels}
                format={(n) => String(n)}
                series={[{ label: t("reports.newPatients"), className: "bg-violet-500", values: newByMonth }]}
              />
              <p className="mt-3 text-xs text-muted-foreground">{tp(newPatients.length, "reports.newCount")}</p>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 font-semibold">{t("reports.weekdays")}</h2>
              <BarChart
                labels={weekdays.map((d) => fmt(new Date(2024, 0, d === 0 ? 7 : d), "EEE"))}
                format={(n) => String(n)}
                height={120}
                series={[{ label: t("reports.sessions"), className: "bg-blue-400", values: byWeekday }]}
              />
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-1 font-semibold">{t("reports.aging")}</h2>
              <p className="mb-3 text-xs text-muted-foreground">{t("reports.agingHint")}</p>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {AGING.map((b, i) => (
                    <tr key={b.key}>
                      <td className="py-2">{t(b.key)}</td>
                      <td className="py-2 text-right text-muted-foreground">{aging[i].count}</td>
                      <td className={cn("py-2 text-right tabular-nums", i > 0 && aging[i].total > 0 && "text-red-600 dark:text-red-400")}>
                        {money(aging[i].total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href="/dashboard/billing?status=unpaid" className="mt-3 inline-block text-xs text-muted-foreground underline underline-offset-2">
                {t("reports.seeUnpaid")}
              </Link>
            </section>
          </div>

          {topIds.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 font-semibold">{t("reports.topPatients")}</h2>
              <ul className="space-y-2">
                {topIds.map(([id, total]) => {
                  const p = topNames.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-center gap-3 text-sm">
                      <Link href={`/dashboard/patients/${id}`} className="w-48 truncate hover:underline">
                        {p ? `${p.lastName}, ${p.firstName}` : "—"}
                      </Link>
                      <div className="h-2 flex-1 rounded bg-muted">
                        <div className="h-2 rounded bg-green-500" style={{ width: `${(total / topIds[0][1]) * 100}%` }} />
                      </div>
                      <span className="w-24 text-right tabular-nums">{moneyShort(total)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
