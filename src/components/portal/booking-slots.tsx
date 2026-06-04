"use client";

import { useState, useTransition } from "react";
import { format, addDays, isToday } from "date-fns";
import { toast } from "sonner";
import { Loader2, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { bookAppointment } from "@/app/portal/actions";

interface BookingSlotsProps {
  workingDays: number[];        // 1=Mon … 7=Sun
  workingHoursStart: string;    // "HH:mm"
  workingHoursEnd: string;      // "HH:mm"
  /** Map from YYYY-MM-DD → array of booked start hours */
  bookedByDate: Record<string, number[]>;
}

function isoDay(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function toDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function BookingSlots({
  workingDays,
  workingHoursStart,
  workingHoursEnd,
  bookedByDate,
}: BookingSlotsProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const startHour = parseInt(workingHoursStart.split(":")[0]);
  const endHour   = parseInt(workingHoursEnd.split(":")[0]);

  // Next 14 days that are working days
  const availableDates: Date[] = [];
  const cursor = new Date();
  // Start from tomorrow so patients can't book same-day
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (availableDates.length < 14) {
    if (workingDays.includes(isoDay(cursor))) {
      availableDates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const slots: number[] = [];
  for (let h = startHour; h < endHour; h++) slots.push(h);

  const dateKey = selectedDate ? toDateKey(selectedDate) : null;
  const booked = dateKey ? (bookedByDate[dateKey] ?? []) : [];

  function handleBook() {
    if (!selectedDate || selectedHour === null) return;
    startTransition(async () => {
      const result = await bookAppointment({
        date: toDateKey(selectedDate),
        hour: selectedHour,
      });
      if (result && !result.success) {
        toast.error(result.error);
      }
      // On success, the server action redirects automatically
    });
  }

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">
          Select a date
        </p>
        <div className="flex flex-wrap gap-2">
          {availableDates.map((d) => {
            const active = selectedDate && toDateKey(d) === toDateKey(selectedDate);
            return (
              <button
                key={toDateKey(d)}
                type="button"
                onClick={() => { setSelectedDate(d); setSelectedHour(null); }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                <span className="font-medium">{format(d, "EEE")}</span>
                <br />
                <span className="text-xs">{format(d, "d MMM")}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Available times — {format(selectedDate, "EEEE d MMMM")}
          </p>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slots defined for this workspace.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((h) => {
                const taken = booked.includes(h);
                const active = selectedHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={taken}
                    onClick={() => setSelectedHour(h)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                      taken && "opacity-40 cursor-not-allowed line-through border-dashed",
                      !taken && active && "bg-primary text-primary-foreground border-primary",
                      !taken && !active && "border-input bg-background hover:bg-muted",
                    )}
                  >
                    {String(h).padStart(2, "0")}:00
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirm */}
      {selectedDate && selectedHour !== null && (
        <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {format(selectedDate, "EEEE d MMMM yyyy")}
              </p>
              <p className="text-xs text-muted-foreground">
                {String(selectedHour).padStart(2, "0")}:00 –{" "}
                {String(selectedHour + 1).padStart(2, "0")}:00 · 60 min
              </p>
            </div>
          </div>
          <Button onClick={handleBook} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm booking
          </Button>
        </div>
      )}
    </div>
  );
}
