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
  ReceiptEuro,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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
  ] = await Promise.all([
    currentUser(),

    prisma.workspace.findUnique({ where: { id: userId }, select: { name: true } }),

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
      prisma.patient.count({ where: { workspaceId: userId } }),
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
              sessionNotes: a.patient.appointments[0].sessionNotes,
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

  const unpaidTotal   = Number(unpaidAgg._sum.totalAmount ?? 0).toFixed(2);
  const revenueTotal  = Number(revenueAgg._sum.totalAmount ?? 0).toFixed(2);

  const stats = [
    {
      label: "Total Patients",
      value: String(totalPatients),
      icon: Users,
      description: "Active in this workspace",
    },
    {
      label: "Sessions this month",
      value: String(completedAppts.length),
      icon: CalendarDays,
      description: "Completed sessions",
    },
    {
      label: "Hours worked",
      value: hoursWorked.toFixed(1),
      icon: Clock,
      description: "This month",
    },
    {
      label: "Unpaid invoices",
      value: `€${unpaidTotal}`,
      icon: ReceiptEuro,
      description: "Total outstanding",
    },
    {
      label: "Revenue",
      value: `€${revenueTotal}`,
      icon: TrendingUp,
      description: "Received this month",
    },
    {
      label: "Missing notes",
      value: String(pendingAppointments.length),
      icon: AlertTriangle,
      description: "Sessions without notes",
      highlight: pendingAppointments.length > 0,
    },
  ];

  const firstName = clerkUser?.firstName ?? "there";

  return (
    <>
      <Header title="Overview" />

      <main className="flex-1 p-6 space-y-6">
        {/* ── Welcome / workspace banner ── */}
        {workspace ? (
          <div className="rounded-xl border bg-card px-6 py-4">
            <p className="text-sm text-muted-foreground">
              {workspace.name}
            </p>
            <h2 className="mt-0.5 text-xl font-semibold">
              Good{now.getHours() < 12 ? " morning" : now.getHours() < 18 ? " afternoon" : " evening"},{" "}
              {firstName}.
              {pendingAppointments.length > 0 && (
                <span className="ml-2 text-base font-normal text-amber-600 dark:text-amber-400">
                  {pendingAppointments.length} session
                  {pendingAppointments.length !== 1 ? "s" : ""} still need notes.
                </span>
              )}
            </h2>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3 dark:border-amber-900 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                No organization selected
              </p>
              <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
                Use the switcher in the sidebar to select a clinic workspace.
              </p>
            </div>
          </div>
        )}

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
