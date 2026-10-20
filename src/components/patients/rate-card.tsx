"use client";

import { useState, useTransition } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Loader2, X } from "lucide-react";
import {
  cancelRateChange,
  markRateChangeNotified,
  schedulePatientRateChange,
} from "@/app/(dashboard)/dashboard/rates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RateChangeItem = {
  id: string;
  amount: number;
  previousAmount: number;
  effectiveFrom: string; // YYYY-MM-DD
  notifiedAt: string | null;
};

export function RateCard({
  patientId,
  currentRate,
  followsPracticeRate,
  currency,
  changes,
  readOnly,
}: {
  patientId: string;
  currentRate: number;
  followsPracticeRate: boolean;
  currency: string;
  changes: RateChangeItem[]; // newest first
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const today = format(new Date(), "yyyy-MM-dd");

  function run(id: string, action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.success) toast.success(ok);
      else toast.error(result.error ?? "Something went wrong");
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <h2 className="font-semibold">Session rate</h2>
          <p className="text-xs text-muted-foreground">
            {currentRate.toFixed(2)} {currency} today
            {followsPracticeRate && " (practice rate)"}
          </p>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Schedule rate change
          </Button>
        )}
      </div>

      {changes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No rate changes.</p>
      ) : (
        <ul className="divide-y">
          {changes.map((c) => {
            const upcoming = c.effectiveFrom > today;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium tabular-nums">
                    {c.previousAmount.toFixed(2)} → {c.amount.toFixed(2)} {currency}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {upcoming ? "From" : "Since"} {format(new Date(c.effectiveFrom), "d MMMM yyyy")}
                  </p>
                </div>
                {c.notifiedAt ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Patient informed {format(new Date(c.notifiedAt), "d MMM")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <BellRing className="h-3.5 w-3.5" />
                    Patient not informed yet
                  </span>
                )}
                {!readOnly && !c.notifiedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busyId === c.id}
                    onClick={() => run(c.id, () => markRateChangeNotified(c.id), "Marked as informed")}
                  >
                    Mark informed
                  </Button>
                )}
                {!readOnly && upcoming && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    title="Cancel this change"
                    disabled={busyId === c.id}
                    onClick={() => run(c.id, () => cancelRateChange(c.id), "Rate change cancelled")}
                  >
                    {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule a rate change</DialogTitle>
            <DialogDescription>
              Sessions on or after the date use the new rate; sessions already booked keep their
              price. You&apos;ll be reminded until you mark the patient as informed.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ScheduleForm
              patientId={patientId}
              currentRate={currentRate}
              currency={currency}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleForm({
  patientId,
  currentRate,
  currency,
  onDone,
}: {
  patientId: string;
  currentRate: number;
  currency: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(currentRate.toFixed(2));
  const [date, setDate] = useState(format(startOfMonth(addMonths(new Date(), 1)), "yyyy-MM-dd"));
  const [isPending, startTransition] = useTransition();
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0 && !!date;

  function handleSave() {
    startTransition(async () => {
      const result = await schedulePatientRateChange(patientId, value, date);
      if (result.success) {
        toast.success("Rate change scheduled");
        onDone();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rate-amount">New rate ({currency})</Label>
          <Input id="rate-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate-date">From</Label>
          <Input id="rate-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={handleSave} disabled={!valid || isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Schedule
        </Button>
      </div>
    </div>
  );
}
