import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { WeekCalendar, type CalendarAppointment } from "@/components/calendar/week-calendar";
import { BookAppointmentButton } from "@/components/calendar/booking-dialog";
import type { PatientOption } from "@/components/calendar/patient-combobox";

interface CalendarPageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { week } = await searchParams;

  // Derive the Monday of the requested week (or current week if none supplied)
  const refDate = week ? new Date(week + "T00:00:00") : new Date();
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(refDate,   { weekStartsOn: 1 });
  const weekISO   = format(weekStart, "yyyy-MM-dd");

  // Fetch appointments + patients for this workspace in parallel
  const [rawAppointments, rawPatients] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        workspaceId: userId,
        startTime: { gte: weekStart, lte: weekEnd },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.patient.findMany({
      where: { workspaceId: userId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  // Serialize Dates → ISO strings before passing to Client Components
  const appointments: CalendarAppointment[] = rawAppointments.map((a) => ({
    id: a.id,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    status: a.status,
    patient: a.patient,
  }));

  const patients: PatientOption[] = rawPatients;

  return (
    <>
      <Header title="Calendar" />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Weekly schedule</h2>
            <p className="text-sm text-muted-foreground">
              {appointments.length} appointment{appointments.length !== 1 ? "s" : ""} this week
            </p>
          </div>
          <BookAppointmentButton patients={patients} />
        </div>

        <WeekCalendar
          appointments={appointments}
          patients={patients}
          currentWeekISO={weekISO}
        />
      </main>
    </>
  );
}
