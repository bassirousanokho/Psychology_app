"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addMinutes, format, isToday, parse } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { periodFor, type TimeOffPeriod } from "@/lib/time-off-shared";
import { HOURLY_DURATIONS, HOURLY_STEP_MIN, MAX_OCCURRENCES, SESSION_TYPES, formatDuration, hourlyAmount, isHourly, type SessionType, type HourlyType } from "@/lib/session-types";
import {
  createAppointment,
  createAppointmentSeries,
  getBusyIntervals,
  previewSeries,
  rescheduleAppointment,
  type SeriesOccurrence,
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
  hourlyRates: Record<HourlyType, number>;
  currency: string;
  timeOff: TimeOffPeriod[]; // upcoming and shown days off (no therapy sessions)
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
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("booking.title")}</DialogTitle>
          <DialogDescription>{t("booking.description")}</DialogDescription>
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
  const { t, tp, fmt, tError, money: formatAmount } = useI18n();
  const money = (n: number) => formatAmount(n, availability.currency);
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
  const away = date ? periodFor(availability.timeOff, date) : undefined;
  const rangeStart = showAllTimes ? EXTENDED_START : availability.workingHoursStart;
  const rangeEnd = showAllTimes ? EXTENDED_END : availability.workingHoursEnd;
  const times =
    day && busy && !(away && !hourly)
      ? hourly
        ? freeStartTimes(day, duration, rangeStart, rangeEnd, [], true)
        : freeStartTimes(day, duration, rangeStart, rangeEnd, busy)
      : [];
  const hourlyPrice = hourly ? hourlyAmount(availability.hourlyRates[type as HourlyType], duration) : null;

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

  // Recurring booking (new bookings only): preview the dates, then book them
  const [repeatWeeks, setRepeatWeeks] = useState(0); // 0 = doesn't repeat, 1 = weekly, 2 = every 2 weeks
  const [repeatCount, setRepeatCount] = useState(10);
  const [preview, setPreview] = useState<SeriesOccurrence[] | null>(null);
  const previewKey = `${patientId}|${type}|${start?.toISOString()}|${duration}|${repeatWeeks}|${repeatCount}`;
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const currentPreview = preview && previewFor === previewKey ? preview : null;
  const freeCount = currentPreview?.filter((o) => o.conflict === null).length ?? 0;
  const repeating = !reschedule && repeatWeeks > 0;

  function handleSubmit() {
    if (!reschedule && !patientId) {
      toast.error(t("booking.selectPatientError"));
      return;
    }
    if (!start || !end) return;
    const payload = { patientId, type, startTime: start.toISOString(), endTime: end.toISOString() };

    if (repeating) {
      startTransition(async () => {
        if (!currentPreview) {
          const result = await previewSeries(payload, repeatWeeks, repeatCount);
          if (result.success) {
            setPreview(result.occurrences);
            setPreviewFor(previewKey);
          } else toast.error(tError(result.error));
          return;
        }
        const result = await createAppointmentSeries(payload, repeatWeeks, repeatCount);
        if (result.success) {
          toast.success(
            t("booking.seriesBooked", { count: result.created }) +
              (result.skipped.length ? t("booking.seriesSkipped", { count: result.skipped.length }) : ""),
          );
          onDone();
        } else toast.error(tError(result.error));
      });
      return;
    }

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
        toast.success(reschedule ? t("booking.rescheduled") : t("booking.booked"));
        onDone();
      } else {
        toast.error(tError(result.error));
        loadBusy(date); // someone may have taken the slot: refresh availability
      }
    });
  }

  return (
    <div className="space-y-5 pt-2">
      {/* Patient */}
      <div className="space-y-1.5">
        <Label>{t("booking.patient")}</Label>
        {reschedule ? (
          <p className="text-sm font-medium">{reschedule.patientName}</p>
        ) : (
          <PatientCombobox patients={patients} value={patientId} onChange={setPatientId} />
        )}
      </div>

      {/* Type (fixed when rescheduling) */}
      <div className="space-y-1.5">
        <Label>{t("booking.type")}</Label>
        {reschedule ? (
          <p className="text-sm font-medium">{t(`type.${type}`)}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {SESSION_TYPES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleTypeChange(st)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  type === st
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                {t(`type.${st}`)}
              </button>
            ))}
          </div>
        )}
        {hourly && (
          <p className="text-xs text-muted-foreground">
            {t("booking.hourlyHint", { rate: money(availability.hourlyRates[type as HourlyType]) })}
          </p>
        )}
      </div>

      {/* Date + duration */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="booking-date">{t("booking.date")}</Label>
          <Input
            id="booking-date"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="booking-duration">{hourly ? t("booking.timeSpent") : t("booking.duration")}</Label>
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
            <Label>{t("booking.startTime")}</Label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showAllTimes} onCheckedChange={setShowAllTimes} />
              {t("booking.showAll")}
            </label>
          </div>

          {away && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {hourly
                ? t("booking.awayHourly", { label: away.label || t("timeOff.default") })
                : t("booking.away", { label: away.label || t("timeOff.default") })}
            </p>
          )}

          {!isWorkingDay && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("booking.notWorkingDay", { day: fmt(day, "EEEE") })}
            </p>
          )}

          {busy === null && !hourly ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("booking.checking")}
            </p>
          ) : times.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
              {showAllTimes ? t("booking.noSlotAll", { duration }) : t("booking.noSlot", { duration })}
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
              {times.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setStartTime(slot)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-sm tabular-nums transition-colors",
                    selected === slot
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Repeat (new bookings only) */}
      {!reschedule && (
        <div className="space-y-2">
          <Label>{t("booking.repeat")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { weeks: 0, label: t("booking.repeatNone") },
              { weeks: 1, label: t("booking.repeatWeekly") },
              { weeks: 2, label: t("booking.repeatBiweekly") },
            ].map((o) => (
              <button
                key={o.weeks}
                type="button"
                onClick={() => setRepeatWeeks(o.weeks)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  repeatWeeks === o.weeks
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
            {repeatWeeks > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Input
                  type="number"
                  min={2}
                  max={MAX_OCCURRENCES}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(2, Math.min(MAX_OCCURRENCES, Number(e.target.value) || 2)))}
                  className="h-8 w-20"
                  aria-label={t("booking.sessionCount")}
                />
                {t("booking.sessions")}
              </label>
            )}
          </div>

          {repeating && currentPreview && (
            <ul className="max-h-40 overflow-y-auto rounded-lg border text-sm">
              {currentPreview.map((o) => (
                <li
                  key={o.start}
                  className={cn("flex justify-between gap-3 px-3 py-1.5", o.conflict !== null && "text-muted-foreground line-through")}
                >
                  <span>{fmt(o.start, "EEE d MMM yyyy, HH:mm")}</span>
                  {o.conflict !== null && (
                    <span className="no-underline text-xs text-destructive">
                      {o.away ? t("booking.onTimeOff", { label: o.conflict || t("timeOff.default") }) : t("booking.takenBy", { name: o.conflict })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Summary + actions */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {start && end
            ? `${fmt(start, "EEE d MMM")} · ${fmt(start, "HH:mm")}–${fmt(end, "HH:mm")}${
                hourlyPrice !== null ? ` · ${money(hourlyPrice)}` : ""
              }`
            : t("booking.selectTime")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {reschedule ? t("common.back") : t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !start || (repeating && !!currentPreview && freeCount === 0)}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reschedule
              ? t("booking.move")
              : repeating
              ? currentPreview
                ? tp(freeCount, "booking.bookN")
                : t("booking.previewDates")
              : t("booking.book")}
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
  const { t } = useI18n();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus className="mr-2 h-4 w-4" />
        {t("calendar.book")}
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
