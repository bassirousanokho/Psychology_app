"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addWeeks,
  subWeeks,
  startOfWeek,
  addDays,
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookingDialog } from "./booking-dialog";
import type { PatientOption } from "./patient-combobox";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarAppointment = {
  id: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  patient: { firstName: string; lastName: string };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_START_HOUR = 8;  // 08:00
const DAY_END_HOUR   = 20; // 20:00
const TOTAL_HOURS    = DAY_END_HOUR - DAY_START_HOUR; // 12
const SLOT_HEIGHT    = 64; // px per hour
const GRID_HEIGHT    = TOTAL_HOURS * SLOT_HEIGHT;     // 768px

const STATUS_STYLES: Record<CalendarAppointment["status"], string> = {
  SCHEDULED:  "bg-blue-100 border-blue-400  text-blue-900  dark:bg-blue-950 dark:border-blue-600 dark:text-blue-200",
  COMPLETED:  "bg-green-100 border-green-400 text-green-900 dark:bg-green-950 dark:border-green-600 dark:text-green-200",
  CANCELLED:  "bg-gray-100  border-gray-300  text-gray-500  dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400",
  NO_SHOW:    "bg-red-100   border-red-400   text-red-900   dark:bg-red-950  dark:border-red-600  dark:text-red-200",
};

const STATUS_LABELS: Record<CalendarAppointment["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW:   "No-show",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesFromDayStart(date: Date): number {
  return (date.getHours() - DAY_START_HOUR) * 60 + date.getMinutes();
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ── Appointment block ─────────────────────────────────────────────────────────

function AppointmentBlock({ appt }: { appt: CalendarAppointment }) {
  const start = new Date(appt.startTime);
  const end   = new Date(appt.endTime);

  const startMin   = clamp(minutesFromDayStart(start), 0, TOTAL_HOURS * 60);
  const durationMin = clamp(
    minutesFromDayStart(end) - minutesFromDayStart(start),
    15,
    TOTAL_HOURS * 60,
  );

  const top    = (startMin / 60) * SLOT_HEIGHT;
  const height = Math.max((durationMin / 60) * SLOT_HEIGHT, 24);

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded border-l-4 px-2 py-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-90",
        STATUS_STYLES[appt.status],
      )}
      style={{ top, height }}
      title={`${appt.patient.lastName}, ${appt.patient.firstName} — ${format(start, "HH:mm")}–${format(end, "HH:mm")}`}
    >
      <p className="truncate text-xs font-semibold leading-tight">
        {appt.patient.lastName}, {appt.patient.firstName}
      </p>
      <p className="truncate text-xs opacity-75">
        {format(start, "HH:mm")} – {format(end, "HH:mm")}
      </p>
      {height >= 56 && (
        <Badge variant="outline" className="mt-1 h-4 px-1 text-[10px]">
          {STATUS_LABELS[appt.status]}
        </Badge>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface WeekCalendarProps {
  appointments: CalendarAppointment[];
  patients: PatientOption[];
  currentWeekISO: string; // yyyy-MM-dd of the Monday
}

export function WeekCalendar({
  appointments,
  patients,
  currentWeekISO,
}: WeekCalendarProps) {
  const router = useRouter();
  const weekStart = startOfWeek(new Date(currentWeekISO + "T00:00:00"), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ start: Date; end: Date } | undefined>();

  function navigate(dir: "prev" | "next") {
    const newWeek = dir === "next" ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1);
    router.push(`/dashboard/calendar?week=${format(newWeek, "yyyy-MM-dd")}`);
  }

  function handleSlotClick(day: Date, slotHour: number) {
    const start = new Date(day);
    start.setHours(slotHour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(slotHour + 1, 0, 0, 0);
    setBookingSlot({ start, end });
    setBookingOpen(true);
  }

  const timeLabels = Array.from(
    { length: TOTAL_HOURS + 1 },
    (_, i) => `${String(DAY_START_HOUR + i).padStart(2, "0")}:00`,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("prev")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            router.push(
              `/dashboard/calendar?week=${format(
                startOfWeek(new Date(), { weekStartsOn: 1 }),
                "yyyy-MM-dd",
              )}`,
            )
          }
        >
          Today
        </Button>
        <Button variant="outline" size="icon" onClick={() => navigate("next")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm font-medium">
          {format(weekStart, "MMMM yyyy")}
        </span>
      </div>

      {/* ── Calendar grid ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Day header row */}
        <div className="grid border-b" style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}>
          <div className="border-r" /> {/* time gutter */}
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "py-2 text-center border-r last:border-r-0",
                isToday(day) && "bg-primary/5",
              )}
            >
              <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  isToday(day) &&
                    "mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        {/* Scrollable time grid */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: "3.5rem repeat(7, 1fr)",
              height: GRID_HEIGHT + SLOT_HEIGHT,
            }}
          >
            {/* Time labels column */}
            <div className="border-r">
              {timeLabels.map((label) => (
                <div
                  key={label}
                  className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground"
                  style={{ height: SLOT_HEIGHT }}
                >
                  <span className="-translate-y-2">{label}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day) => {
              const dayAppts = appointments.filter((a) =>
                isSameDay(new Date(a.startTime), day),
              );

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative border-r last:border-r-0",
                    isToday(day) && "bg-primary/5",
                  )}
                  style={{ height: GRID_HEIGHT + SLOT_HEIGHT }}
                >
                  {/* Hour lines + clickable slots */}
                  {Array.from({ length: TOTAL_HOURS }, (_, h) => (
                    <div
                      key={h}
                      className="absolute w-full border-t border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                      style={{ top: h * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      onClick={() => handleSlotClick(day, DAY_START_HOUR + h)}
                    />
                  ))}

                  {/* Appointment blocks */}
                  {dayAppts.map((appt) => (
                    <AppointmentBlock key={appt.id} appt={appt} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Booking dialog */}
      <BookingDialog
        patients={patients}
        initialStart={bookingSlot?.start}
        initialEnd={bookingSlot?.end}
        open={bookingOpen}
        onOpenChange={(o) => {
          setBookingOpen(o);
          if (!o) setBookingSlot(undefined);
        }}
      />
    </div>
  );
}
