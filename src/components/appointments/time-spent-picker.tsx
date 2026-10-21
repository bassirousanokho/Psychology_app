"use client";

import { useState, useTransition } from "react";
import { addMinutes } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { rescheduleAppointment } from "@/app/(dashboard)/dashboard/calendar/actions";
import { formatDuration, hourlyAmount, HOURLY_DURATIONS } from "@/lib/session-types";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";

/** Hourly work: change the time spent (half-hour steps); the price follows. */
export function TimeSpentPicker({
  appointmentId,
  startTime,
  minutes,
  hourlyRate,
  currency,
}: {
  appointmentId: string;
  startTime: string;
  minutes: number;
  hourlyRate: number;
  currency: string;
}) {
  const [value, setValue] = useState(minutes);
  const [isPending, startTransition] = useTransition();
  const { t, tError, money } = useI18n();
  const options = HOURLY_DURATIONS.includes(minutes)
    ? HOURLY_DURATIONS
    : [...HOURLY_DURATIONS, minutes].sort((a, b) => a - b);

  function handleChange(next: number) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const start = new Date(startTime);
      const result = await rescheduleAppointment(
        appointmentId,
        start.toISOString(),
        addMinutes(start, next).toISOString(),
      );
      if (result.success) toast.success(t("timeSpent.toast", { duration: formatDuration(next) }));
      else {
        setValue(previous);
        toast.error(tError(result.error));
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Label htmlFor="time-spent">{t("timeSpent.label")}</Label>
      <select
        id="time-spent"
        value={value}
        disabled={isPending}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {formatDuration(m)}
          </option>
        ))}
      </select>
      <span className="text-sm tabular-nums text-muted-foreground">
        = {money(hourlyAmount(hourlyRate, value), currency)}
      </span>
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
