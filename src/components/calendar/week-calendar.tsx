"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMinutes,
  addWeeks,
  differenceInMinutes,
  format,
  isSameDay,
  isToday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isHourly, type SessionType } from "@/lib/session-types";
import { useI18n } from "@/i18n/client";
import { rescheduleAppointment } from "@/app/(dashboard)/dashboard/calendar/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookingDialog, type Availability } from "./booking-dialog";
import { AppointmentDialog } from "./appointment-dialog";
import { gridHours, layoutLanes } from "@/lib/calendar-layout";
import type { PatientOption } from "./patient-combobox";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarAppointment = {
  id: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  type: SessionType;
  price: number;     // session price snapshot (pre-fills a cancellation fee)
  invoiced: boolean;
  seriesId: string | null; // recurring sessions booked together
  patient: { firstName: string; lastName: string };
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Visible hours follow the working hours (see gridHours), so they're computed per render
const SLOT_HEIGHT    = 64; // px per hour
const DRAG_SNAP_MIN  = 15;

const STATUS_STYLES: Record<CalendarAppointment["status"], string> = {
  SCHEDULED:  "bg-blue-100 border-blue-400  text-blue-900  dark:bg-blue-950 dark:border-blue-600 dark:text-blue-200",
  COMPLETED:  "bg-green-100 border-green-400 text-green-900 dark:bg-green-950 dark:border-green-600 dark:text-green-200",
  CANCELLED:  "bg-gray-100  border-gray-300  text-gray-500  dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400",
  NO_SHOW:    "bg-red-100   border-red-400   text-red-900   dark:bg-red-950  dark:border-red-600  dark:text-red-200",
};

// Hourly work is coloured by type (status shown in the badge)
const HOURLY_STYLES: Record<Exclude<SessionType, "PSYCHOTHERAPY">, string> = {
  ADMIN:   "bg-violet-100 border-violet-400 text-violet-900 dark:bg-violet-950 dark:border-violet-600 dark:text-violet-200",
  WRITING: "bg-amber-100  border-amber-400  text-amber-900  dark:bg-amber-950  dark:border-amber-600  dark:text-amber-200",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesFromDayStart(date: Date, dayStartHour: number): number {
  return (date.getHours() - dayStartHour) * 60 + date.getMinutes();
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function blockStyle(appt: CalendarAppointment): string {
  const inactive = appt.status === "CANCELLED" || appt.status === "NO_SHOW";
  if (isHourly(appt.type) && !inactive) return HOURLY_STYLES[appt.type as "ADMIN" | "WRITING"];
  return STATUS_STYLES[appt.status];
}

/** Scheduled sessions and uninvoiced hourly work can be dragged to a new time. */
function isMovable(appt: CalendarAppointment): boolean {
  if (appt.invoiced) return false;
  return appt.status === "SCHEDULED" || (isHourly(appt.type) && appt.status === "COMPLETED");
}

// ── Appointment block ─────────────────────────────────────────────────────────

function AppointmentBlock({
  appt,
  lane,
  lanes,
  dayStartHour,
  totalHours,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  appt: CalendarAppointment;
  lane: number;
  lanes: number;
  dayStartHour: number;
  totalHours: number;
  onSelect: (appt: CalendarAppointment) => void;
  onDragStart: (appt: CalendarAppointment, grabOffsetMin: number) => void;
  onDragEnd: () => void;
}) {
  const start = new Date(appt.startTime);
  const end   = new Date(appt.endTime);

  const startMin   = clamp(minutesFromDayStart(start, dayStartHour), 0, totalHours * 60);
  const durationMin = clamp(
    differenceInMinutes(end, start),
    15,
    totalHours * 60 - startMin,
  );

  const top    = (startMin / 60) * SLOT_HEIGHT;
  const height = Math.max((durationMin / 60) * SLOT_HEIGHT, 24);
  const movable = isMovable(appt);
  const { t, fmt } = useI18n();
  const label = isHourly(appt.type) ? t(`type.${appt.type}`) : t(`status.${appt.status}`);

  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", appt.id);
        onDragStart(appt, (e.nativeEvent.offsetY / SLOT_HEIGHT) * 60);
      }}
      onDragEnd={onDragEnd} // dropped outside the grid: clear the preview
      onClick={() => onSelect(appt)}
      className={cn(
        "absolute rounded border-l-4 px-2 py-1 overflow-hidden text-left transition-opacity hover:opacity-90",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        blockStyle(appt),
        (appt.status === "CANCELLED" || appt.status === "NO_SHOW") && "line-through decoration-1",
      )}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      }}
      title={`${appt.patient.lastName}, ${appt.patient.firstName} — ${fmt(start, "HH:mm")}–${fmt(end, "HH:mm")}${movable ? t("calendar.dragToMove") : ""}`}
    >
      <p className="truncate text-xs font-semibold leading-tight">
        {appt.patient.lastName}, {appt.patient.firstName}
      </p>
      <p className="truncate text-xs opacity-75">
        {fmt(start, "HH:mm")} – {fmt(end, "HH:mm")}
      </p>
      {height >= 56 && (
        <Badge variant="outline" className="mt-1 h-4 px-1 text-[10px]">
          {label}
        </Badge>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface WeekCalendarProps {
  appointments: CalendarAppointment[];
  patients: PatientOption[];
  availability: Availability;
  cancellationNoticeHours: number;
  currentWeekISO: string; // yyyy-MM-dd of the Monday
}

type DragState = { appt: CalendarAppointment; grabOffsetMin: number; durationMin: number };
type DropPreview = { dayKey: string; startMin: number; durationMin: number };
// Optimistic position while the server confirms a drop; ignored once the server
// data no longer matches `from` (moved for real) or removed if the move fails
type PendingMove = { from: string; startTime: string; endTime: string };

export function WeekCalendar({
  appointments,
  patients,
  availability,
  cancellationNoticeHours,
  currentWeekISO,
}: WeekCalendarProps) {
  const router = useRouter();
  const { t, fmt, tError } = useI18n();
  const weekStart = startOfWeek(new Date(currentWeekISO + "T00:00:00"), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStart, setBookingStart] = useState<Date | undefined>();
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [pendingMoves, setPendingMoves] = useState<Record<string, PendingMove>>({});

  const shown = appointments.map((a) => {
    const move = pendingMoves[a.id];
    return move && move.from === a.startTime ? { ...a, startTime: move.startTime, endTime: move.endTime } : a;
  });

  const { start: dayStartHour, end: dayEndHour } = gridHours(
    availability.workingHoursStart,
    availability.workingHoursEnd,
    shown,
  );
  const totalHours = dayEndHour - dayStartHour;
  const gridHeight = totalHours * SLOT_HEIGHT;

  function navigate(dir: "prev" | "next") {
    const newWeek = dir === "next" ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1);
    router.push(`/dashboard/calendar?week=${format(newWeek, "yyyy-MM-dd")}`);
  }

  function handleSlotClick(day: Date, slotHour: number) {
    const start = new Date(day);
    start.setHours(slotHour, 0, 0, 0);
    setBookingStart(start);
    setBookingOpen(true);
  }

  // ── Drag and drop ──

  function dropStartMin(e: React.DragEvent<HTMLDivElement>, state: DragState): number {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const raw = (y / SLOT_HEIGHT) * 60 - state.grabOffsetMin;
    const snapped = Math.round(raw / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;
    return clamp(snapped, 0, totalHours * 60 - state.durationMin);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, day: Date) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const startMin = dropStartMin(e, drag);
    const dayKey = format(day, "yyyy-MM-dd");
    if (preview?.dayKey !== dayKey || preview.startMin !== startMin) {
      setPreview({ dayKey, startMin, durationMin: drag.durationMin });
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>, day: Date) {
    e.preventDefault();
    const state = drag;
    setDrag(null);
    setPreview(null);
    if (!state) return;

    const start = new Date(day);
    start.setHours(dayStartHour, 0, 0, 0);
    const newStart = addMinutes(start, dropStartMin(e, state));
    const newEnd = addMinutes(newStart, state.durationMin);
    const { appt } = state;
    if (newStart.toISOString() === appt.startTime) return;

    setPendingMoves((m) => ({
      ...m,
      [appt.id]: { from: appt.startTime, startTime: newStart.toISOString(), endTime: newEnd.toISOString() },
    }));
    const result = await rescheduleAppointment(appt.id, newStart.toISOString(), newEnd.toISOString());
    if (result.success) {
      toast.success(t("calendar.moved", { date: fmt(newStart, "EEE d MMM, HH:mm") }));
    } else {
      toast.error(tError(result.error));
      setPendingMoves((m) => {
        const next = { ...m };
        delete next[appt.id];
        return next;
      });
    }
  }

  const timeLabels = Array.from(
    { length: totalHours + 1 },
    (_, i) => `${String(dayStartHour + i).padStart(2, "0")}:00`,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
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
          {t("calendar.today")}
        </Button>
        <Button variant="outline" size="icon" onClick={() => navigate("next")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm font-medium">
          {fmt(weekStart, "MMMM yyyy")}
        </span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />{t("type.PSYCHOTHERAPY")}</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-violet-400" />{t("typeShort.ADMIN")}</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />{t("typeShort.WRITING")}</span>
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
              <p className="text-xs text-muted-foreground">{fmt(day, "EEE")}</p>
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
              height: gridHeight + SLOT_HEIGHT,
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
              const dayKey = format(day, "yyyy-MM-dd");
              const dayAppts = shown.filter((a) => isSameDay(new Date(a.startTime), day));
              const lanes = layoutLanes(dayAppts);
              const dayPreview = preview?.dayKey === dayKey ? preview : null;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative border-r last:border-r-0",
                    isToday(day) && "bg-primary/5",
                  )}
                  style={{ height: gridHeight + SLOT_HEIGHT }}
                  onDragOver={(e) => handleDragOver(e, day)}
                  onDrop={(e) => handleDrop(e, day)}
                >
                  {/* Hour lines + clickable slots */}
                  {Array.from({ length: totalHours }, (_, h) => (
                    <div
                      key={h}
                      className="absolute w-full border-t border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                      style={{ top: h * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      onClick={() => handleSlotClick(day, dayStartHour + h)}
                    />
                  ))}

                  {/* Appointment blocks */}
                  {dayAppts.map((appt) => {
                    const { lane, lanes: laneCount } = lanes.get(appt.id) ?? { lane: 0, lanes: 1 };
                    return (
                      <AppointmentBlock
                        key={appt.id}
                        appt={appt}
                        lane={lane}
                        lanes={laneCount}
                        dayStartHour={dayStartHour}
                        totalHours={totalHours}
                        onSelect={setSelected}
                        onDragEnd={() => {
                          setDrag(null);
                          setPreview(null);
                        }}
                        onDragStart={(a, grabOffsetMin) =>
                          setDrag({
                            appt: a,
                            grabOffsetMin,
                            durationMin: differenceInMinutes(new Date(a.endTime), new Date(a.startTime)),
                          })
                        }
                      />
                    );
                  })}

                  {/* Drop preview */}
                  {dayPreview && (
                    <div
                      className="pointer-events-none absolute left-1 right-1 rounded border-2 border-dashed border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                      style={{
                        top: (dayPreview.startMin / 60) * SLOT_HEIGHT,
                        height: Math.max((dayPreview.durationMin / 60) * SLOT_HEIGHT, 24),
                      }}
                    >
                      {format(addMinutes(new Date(`${dayKey}T00:00:00`), dayStartHour * 60 + dayPreview.startMin), "HH:mm")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Manage an existing session */}
      <AppointmentDialog
        appointment={selected}
        availability={availability}
        cancellationNoticeHours={cancellationNoticeHours}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      {/* Booking dialog */}
      <BookingDialog
        patients={patients}
        availability={availability}
        initialStart={bookingStart}
        open={bookingOpen}
        onOpenChange={(o) => {
          setBookingOpen(o);
          if (!o) setBookingStart(undefined);
        }}
      />
    </div>
  );
}
