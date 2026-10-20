"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addMinutes, format, isToday, parse } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  HOURLY_DURATIONS,
  HOURLY_STEP_MIN,
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
  formatDuration,
  hourlyAmount,
  isHourly,
  type SessionType,
} from "@/lib/session-types";
import {
  createAppointment,
  getBusyIntervals,
  rescheduleAppointment,
} from "@/app/(dashboard)/dashboard/calendar/actions";
import type { PatientOption } from "./patient-combobox";
import { PatientCombobox } from "./patient-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Availability = {
  workingDays: number[];      // 1=Mon … 7=Sun
  workingHoursStart: string;  // "HH:mm"
  workingHoursEnd: string;    // "HH:mm"
  hourlyRates: { ADMIN: number; WRITING: number };
  currency: string;
};

const DURATIONS = [30, 45, 50, 60, 75, 90, 120];
const DEFAULT_DURATION = 60;
const SLOT_STEP_MIN = 15;
// Range offered when "Show all times" is on
const EXTENDED_START = "07:00";
const EXTENDED_END = "21:00";

type Interval = { start: Date; end: Date };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function isoDay(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/**
 * Start times (HH:mm) on `date` where a session of `duration` fits without
 * overlapping `busy`. Hourly work passes no busy intervals and allowPast, since
 * it may overlap anything and is often logged afterwards.
 */
function freeStartTimes(
  date: Date,
  duration: number,
  rangeStart: string,
  rangeEnd: string,
  busy: Interval[],
  allowPast = false,
): string[] {
  const now = new Date();
  const times: string[] = [];
  for (let m = toMinutes(rangeStart); m + duration <= toMinutes(rangeEnd); m += SLOT_STEP_MIN) {
    const start = new Date(date);
    start.setHours(Math.floor(m / 60), m % 60, 0, 0);
    const end = addMinutes(start, duration);
    if (!allowPast && isToday(date) && start <= now) continue;
    if (busy.some((b) => b.start < end && b.end > start)) continue;
    times.push(toHHmm(m));
  }
  return times;
}

// ── Dialog ────────────────────────────────────────────────────────────────────

interface BookingDialogProps {
  patients: PatientOption[];
  availability: Availability;
  // Pre-fill date/start when the user clicks an empty time slot
  initialStart?: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookingDialog({
  patients,
  availability,
  initialStart,
  open,
  onOpenChange,
}: BookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>
            Pick a patient, the type, a date and a duration, then choose a start time.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open so every opening starts from fresh values */}
        {open && (
          <BookingForm
            patients={patients}
            availability={availability}
            initialStart={initialStart}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

/** When set, the form moves an existing session instead of booking a new one. */
export type RescheduleTarget = {
  appointmentId: string;
  patientName: string;
  type: SessionType;
  start: Date;
  durationMin: number;
};

export function BookingForm({
  patients,
  availability,
  initialStart,
  reschedule,
  onDone,
  onCancel = onDone,
}: {
  patients: PatientOption[];
  availability: Availability;
  initialStart?: Date;
  reschedule?: RescheduleTarget;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const start0 = reschedule?.start ?? initialStart;
  const initialDuration = reschedule?.durationMin ?? DEFAULT_DURATION;
  const [type, setType] = useState<SessionType>(reschedule?.type ?? "PSYCHOTHERAPY");
  const hourly = isHourly(type);
  const baseDurations = hourly ? HOURLY_DURATIONS : DURATIONS;
  const durations = baseDurations.includes(initialDuration)
    ? baseDurations
    : [...baseDurations, initialDuration].sort((a, b) => a - b);
  const initialTime = start0 ? format(start0, "HH:mm") : null;
  const outsideHours =
    initialTime !== null &&
    (toMinutes(initialTime) < toMinutes(availability.workingHoursStart) ||
      toMinutes(initialTime) + initialDuration > toMinutes(availability.workingHoursEnd));

  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(format(start0 ?? new Date(), "yyyy-MM-dd"));
  const [duration, setDuration] = useState(initialDuration);
  const [startTime, setStartTime] = useState<string | null>(initialTime);
  const [showAllTimes, setShowAllTimes] = useState(outsideHours);
  const [busy, setBusy] = useState<Interval[] | null>(null); // null = loading
  const [isPending, startTransition] = useTransition();
  const latestDate = useRef(date);

  function loadBusy(forDate: string) {
    latestDate.current = forDate;
    // When rescheduling, the session's own current slot counts as free
    getBusyIntervals(forDate, reschedule?.appointmentId).then((rows) => {
      if (latestDate.current !== forDate) return; // a newer date was picked meanwhile
      setBusy(rows.map((r) => ({ start: new Date(r.start), end: new Date(r.end) })));
    });
  }

  useEffect(() => {
    loadBusy(latestDate.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  function handleDateChange(value: string) {
    setDate(value);
    setStartTime(null);
    if (!value) return;
    setBusy(null);
    loadBusy(value);
  }

  const day = date ? parse(date, "yyyy-MM-dd", new Date()) : null;
  const isWorkingDay = day ? availability.workingDays.includes(isoDay(day)) : true;
  const rangeStart = showAllTimes ? EXTENDED_START : availability.workingHoursStart;
  const rangeEnd = showAllTimes ? EXTENDED_END : availability.workingHoursEnd;
  const times =
    day && busy
      ? hourly
        ? freeStartTimes(day, duration, rangeStart, rangeEnd, [], true)
        : freeStartTimes(day, duration, rangeStart, rangeEnd, busy)
      : [];
  const hourlyPrice = hourly ? hourlyAmount(availability.hourlyRates[type as "ADMIN" | "WRITING"], duration) : null;

  function handleTypeChange(next: SessionType) {
    setType(next);
    // Hourly work is filled per half hour: snap the duration to a valid step
    if (isHourly(next) && duration % HOURLY_STEP_MIN !== 0) {
      setDuration(Math.max(HOURLY_STEP_MIN, Math.round(duration / HOURLY_STEP_MIN) * HOURLY_STEP_MIN));
    } else if (!isHourly(next) && !DURATIONS.includes(duration)) {
      setDuration(DEFAULT_DURATION);
    }
  }

  // A previously picked time may stop fitting when the duration or range changes
  const selected = startTime && times.includes(startTime) ? startTime : null;
  const start = day && selected ? parse(selected, "HH:mm", day) : null;
  const end = start ? addMinutes(start, duration) : null;

  function handleSubmit() {
    if (!reschedule && !patientId) {
      toast.error("Please select a patient");
      return;
    }
    if (!start || !end) return;
    startTransition(async () => {
      const result = reschedule
        ? await rescheduleAppointment(reschedule.appointmentId, start.toISOString(), end.toISOString())
        : await createAppointment({
            patientId,
            type,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          });
      if (result.success) {
        toast.success(reschedule ? "Appointment rescheduled" : "Appointment booked");
        onDone();
      } else {
        toast.error(result.error);
        loadBusy(date); // someone may have taken the slot: refresh availability
      }
    });
  }

  return (
    <div className="space-y-5 pt-2">
      {/* Patient */}
      <div className="space-y-1.5">
        <Label>Patient</Label>
        {reschedule ? (
          <p className="text-sm font-medium">{reschedule.patientName}</p>
        ) : (
          <PatientCombobox patients={patients} value={patientId} onChange={setPatientId} />
        )}
      </div>

      {/* Type (fixed when rescheduling) */}
      <div className="space-y-1.5">
        <Label>Type</Label>
        {reschedule ? (
          <p className="text-sm font-medium">{SESSION_TYPE_LABELS[type]}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {SESSION_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  type === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                {SESSION_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
        {hourly && (
          <p className="text-xs text-muted-foreground">
            Billed per hour ({availability.hourlyRates[type as "ADMIN" | "WRITING"].toFixed(2)}{" "}
            {availability.currency}/h). Can overlap other sessions.
          </p>
        )}
      </div>

      {/* Date + duration */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="booking-date">Date</Label>
          <Input
            id="booking-date"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="booking-duration">{hourly ? "Time spent" : "Duration"}</Label>
          <select
            id="booking-duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Start times */}
      {day && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Start time</Label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showAllTimes} onCheckedChange={setShowAllTimes} />
              Show all times
            </label>
          </div>

          {!isWorkingDay && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {format(day, "EEEE")} is not one of your working days.
            </p>
          )}

          {busy === null && !hourly ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking availability…
            </p>
          ) : times.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
              No free {duration}-minute slot
              {showAllTimes ? " on this day." : " within your working hours. Try “Show all times”."}
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
              {times.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStartTime(t)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-sm tabular-nums transition-colors",
                    selected === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary + actions */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {start && end
            ? `${format(start, "EEE d MMM")} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}${
                hourlyPrice !== null ? ` · ${hourlyPrice.toFixed(2)} ${availability.currency}` : ""
              }`
            : "Select a start time"}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {reschedule ? "Back" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !start}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reschedule ? "Move session" : "Book"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Trigger button (standalone) ───────────────────────────────────────────────

export function BookAppointmentButton({
  patients,
  availability,
}: {
  patients: PatientOption[];
  availability: Availability;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus className="mr-2 h-4 w-4" />
        Book appointment
      </Button>
      <BookingDialog
        patients={patients}
        availability={availability}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
