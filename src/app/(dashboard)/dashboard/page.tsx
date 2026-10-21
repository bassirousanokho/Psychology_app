import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  differenceInMinutes,
} from "date-fns";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { decrypt } from "@/lib/crypto";
import { makeI18n, toLang } from "@/i18n/core";
import { formatMoney, localeOf } from "@/lib/format";
import { getReminders } from "@/lib/reminders";
import { Reminders } from "@/components/dashboard/reminders";
import {
  TodaysSchedule,
  type TodayAppointment,
} from "@/components/dashboard/todays-schedule";
import {
  PendingTasks,
  type PendingAppointment,
} from "@/components/dashboard/pending-tasks";
import {
  CalendarDays,
  Users,
  Clock,
  Receipt,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const now        = new Date();
  const todayStart = startOfDay(now);
  const todayEnd   = endOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);

  // Fetch everything in one parallel round-trip
  const [
    clerkUser,
    workspace,
    todayRaw,
    pendingRaw,
    monthlyStats,
    reminders,
  ] = await Promise.all([
    currentUser(),

    prisma.workspace.findUnique({
      where: { id: userId },
      select: { name: true, currency: true, language: true, region: true },
    }),

    // ── Today's appointments with patient + previous session note ────────────
    prisma.appointment.findMany({
          where: {
            workspaceId: userId,
            startTime: { gte: todayStart, lte: todayEnd },
            status: { notIn: ["CANCELLED"] },
          },
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
                backgroundNotes: true,
                // Previous completed session (before today)
                appointments: {
                  where: {
                    status: "COMPLETED",
                    noteCompletedAt: { not: null },
                    startTime: { lt: todayStart },
                  },
                  orderBy: { startTime: "desc" },
                  take: 1,
                  select: { sessionNotes: true, startTime: true },
                },
              },
            },
          },
          orderBy: { startTime: "asc" },
        }),

    // ── Past appointments missing notes ──────────────────────────────────────
    prisma.appointment.findMany({
      where: {
        workspaceId: userId,
        endTime: { lt: now },
        noteCompletedAt: null,
        type: "PSYCHOTHERAPY", // notes are optional for hourly work
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { endTime: "desc" },
      take: 20,
    }),

    // ── Monthly aggregate stats ──────────────────────────────────────────────
    Promise.all([
      prisma.patient.count({ where: { workspaceId: userId, deletedAt: null } }),
      prisma.appointment.findMany({
        where: {
          workspaceId: userId,
          startTime: { gte: monthStart, lte: monthEnd },
          status: { in: ["COMPLETED"] },
        },
        select: { startTime: true, endTime: true },
      }),
      prisma.invoice.aggregate({
        where: {
          workspaceId: userId,
          status: { in: ["DRAFT", "SENT", "OVERDUE"] },
        },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          workspaceId: userId,
          status: "PAID",
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { totalAmount: true },
      }),
    ]),

    getReminders(userId),
  ]);

  // ── Serialize Dates → ISO strings ────────────────────────────────────────

  const todayAppointments: TodayAppointment[] = todayRaw.map((a) => ({
    id: a.id,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    status: a.status,
    patient: {
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
      backgroundNotes: a.patient.backgroundNotes,
      previousNote:
        a.patient.appointments[0]
          ? {
              sessionNotes: decrypt(a.patient.appointments[0].sessionNotes), // stored encrypted
              startTime: a.patient.appointments[0].startTime.toISOString(),
            }
          : null,
    },
  }));

  const pendingAppointments: PendingAppointment[] = pendingRaw.map((a) => ({
    id: a.id,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    patient: { firstName: a.patient.firstName, lastName: a.patient.lastName },
  }));

  // ── Compute stats ────────────────────────────────────────────────────────

  const [totalPatients, completedAppts, unpaidAgg, revenueAgg] =
    monthlyStats as [
      number,
      Array<{ startTime: Date; endTime: Date }>,
      { _sum: { totalAmount: null | import("@/generated/prisma/client").Prisma.Decimal } },
      { _sum: { totalAmount: null | import("@/generated/prisma/client").Prisma.Decimal } },
    ];

  const hoursWorked = completedAppts
    .reduce((acc, a) => acc + differenceInMinutes(a.endTime, a.startTime), 0) / 60;

  const { t, tp } = makeI18n(toLang(workspace?.language));
  const locale        = localeOf(toLang(workspace?.language), workspace?.region);
  const currency      = workspace?.currency ?? "CAD";
  const unpaidTotal   = formatMoney(Number(unpaidAgg._sum.totalAmount ?? 0), currency, locale);
  const revenueTotal  = formatMoney(Number(revenueAgg._sum.totalAmount ?? 0), currency, locale);

  const stats = [
    {
      label: t("overview.stat.patients"),
      value: String(totalPatients),
      icon: Users,
      description: t("overview.stat.patientsHint"),
    },
    {
      label: t("overview.stat.sessions"),
      value: String(completedAppts.length),
      icon: CalendarDays,
      description: t("overview.stat.sessionsHint"),
    },
    {
      label: t("overview.stat.hours"),
      value: hoursWorked.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
      icon: Clock,
      description: t("overview.stat.hoursHint"),
    },
    {
      label: t("overview.stat.unpaid"),
      value: unpaidTotal,
      icon: Receipt,
      description: t("overview.stat.unpaidHint"),
    },
    {
      label: t("overview.stat.revenue"),
      value: revenueTotal,
      icon: TrendingUp,
      description: t("overview.stat.revenueHint"),
    },
    {
      label: t("overview.stat.missing"),
      value: String(pendingAppointments.length),
      icon: AlertTriangle,
      description: t("overview.stat.missingHint"),
      highlight: pendingAppointments.length > 0,
    },
  ];

  const firstName = clerkUser?.firstName ?? t("overview.greeting.fallbackName");
  const greetingKey =
    now.getHours() < 12 ? "overview.greeting.morning" : now.getHours() < 18 ? "overview.greeting.afternoon" : "overview.greeting.evening";

  return (
    <>
      <Header title={t("nav.overview")} />

      <main className="flex-1 p-6 space-y-6">
        {/* ── Welcome banner ── */}
        <div className="rounded-xl border bg-card px-6 py-4">
          <p className="text-sm text-muted-foreground">
            {workspace?.name}
          </p>
          <h2 className="mt-0.5 text-xl font-semibold">
            {t(greetingKey, { name: firstName }).replace(/\s+\./, ".")}
            {pendingAppointments.length > 0 && (
              <span className="ml-2 text-base font-normal text-amber-600 dark:text-amber-400">
                {tp(pendingAppointments.length, "overview.needNotes")}
              </span>
            )}
          </h2>
        </div>

        {/* ── Reminders (rate announcements, cancellation alerts, retention) ── */}
        <Reminders data={reminders} />

        {/* ── Today's schedule + Pending tasks ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TodaysSchedule appointments={todayAppointments} />
          <PendingTasks appointments={pendingAppointments} />
        </div>

        {/* ── Stats grid ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-xl border bg-card p-5 flex items-start gap-4 ${
                stat.highlight ? "border-amber-300 dark:border-amber-800" : ""
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  stat.highlight ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"
                }`}
              >
                <stat.icon
                  className={`h-5 w-5 ${
                    stat.highlight
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                <p className="text-sm font-medium">{stat.label}</p>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
