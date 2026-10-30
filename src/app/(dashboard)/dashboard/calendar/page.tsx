import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Header } from "@/components/layout/header";
import { getI18n } from "@/i18n/server";
import prisma from "@/lib/prisma";
import { CalendarView, type CalendarAppointment, type CalendarViewMode } from "@/components/calendar/calendar-view";
import { BookAppointmentButton, type Availability } from "@/components/calendar/booking-dialog";
import type { PatientOption } from "@/components/calendar/patient-combobox";
import { TimeOffButton } from "@/components/calendar/time-off-dialog";
import { timeOffBetween, upcomingTimeOff } from "@/lib/time-off";

interface CalendarPageProps {
  searchParams: Promise<{ view?: string; date?: string; week?: string }>;
}

const VIEWS: CalendarViewMode[] = ["day", "week", "month"];

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const view: CalendarViewMode = VIEWS.includes(params.view as CalendarViewMode) ? (params.view as CalendarViewMode) : "week";
  // `week` is the older link format (the Monday of the week)
  const requested = params.date ?? params.week;
  const parsed = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? new Date(requested + "T00:00:00") : null;
  const anchor = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
  const anchorISO = format(anchor, "yyyy-MM-dd");

  // Range shown: the day, the week (Monday–Sunday), or the whole weeks covering the month
  const [rangeStart, rangeEnd] =
    view === "day"
      ? [startOfDay(anchor), endOfDay(anchor)]
      : view === "week"
      ? [startOfWeek(anchor, { weekStartsOn: 1 }), endOfWeek(anchor, { weekStartsOn: 1 })]
      : [startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })];

  // Fetch appointments + patients for this workspace in parallel
  const [rawAppointments, rawPatients, workspace] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        workspaceId: userId,
        startTime: { gte: rangeStart, lte: rangeEnd },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        invoice: { select: { id: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.patient.findMany({
      where: { workspaceId: userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workspace.findUnique({
      where: { id: userId },
      select: {
        workingDays: true,
        workingHoursStart: true,
        workingHoursEnd: true,
        hourlyRateAdmin: true,
        hourlyRateWriting: true,
        hourlyRateConference: true,
        currency: true,
        cancellationNoticeHours: true,
      },
    }),
  ]);

  // Days off shown in this view, plus upcoming ones (booking dialog, time off list)
  const [shownOff, upcomingOff] = await Promise.all([
    timeOffBetween(userId, rangeStart, rangeEnd),
    upcomingTimeOff(userId),
  ]);
  const timeOff = [...shownOff, ...upcomingOff.filter((u) => !shownOff.some((s) => s.id === u.id))];

  const availability: Availability = {
    workingDays: workspace?.workingDays ?? [1, 2, 3, 4, 5],
    workingHoursStart: workspace?.workingHoursStart ?? "09:00",
    workingHoursEnd: workspace?.workingHoursEnd ?? "18:00",
    hourlyRates: {
      ADMIN: Number(workspace?.hourlyRateAdmin ?? 0),
      WRITING: Number(workspace?.hourlyRateWriting ?? 0),
      CONFERENCE: Number(workspace?.hourlyRateConference ?? 0),
    },
    currency: workspace?.currency ?? "EUR",
    timeOff,
  };

  // Serialize Dates → ISO strings before passing to Client Components
  const appointments: CalendarAppointment[] = rawAppointments.map((a) => ({
    id: a.id,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    status: a.status,
    type: a.type,
    price: Number(a.tariffAmount),
    invoiced: a.invoice !== null,
    seriesId: a.seriesId,
    patient: a.patient,
  }));

  const patients: PatientOption[] = rawPatients;
  const activeCount = appointments.filter((a) => a.status !== "CANCELLED").length;
  const { t, tp } = await getI18n(userId);

  return (
    <>
      <Header title={t("nav.calendar")} />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {tp(activeCount, `calendar.count.${view}`)}
          </p>
          <div className="flex flex-wrap gap-2">
            <TimeOffButton upcoming={upcomingOff} />
            <BookAppointmentButton patients={patients} availability={availability} />
          </div>
        </div>

        <CalendarView
          key={`${view}-${anchorISO}`}
          appointments={appointments}
          patients={patients}
          availability={availability}
          cancellationNoticeHours={workspace?.cancellationNoticeHours ?? 48}
          view={view}
          anchorISO={anchorISO}
        />
      </main>
    </>
  );
}
