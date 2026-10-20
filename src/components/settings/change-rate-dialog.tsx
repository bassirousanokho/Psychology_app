"use client";

import { useEffect, useState, useTransition } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  changePracticeRate,
  getRateCandidates,
  type RateCandidate,
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

export function ChangeRateDialog({ currentRate, currency }: { currentRate: number; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change rate…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Change the practice rate</DialogTitle>
            <DialogDescription>
              Choose which patients move to the new rate and from when. You&apos;ll get a reminder to
              inform each of them. Sessions already booked keep their price.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ChangeRateForm
              currentRate={currentRate}
              currency={currency}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangeRateForm({
  currentRate,
  currency,
  onDone,
}: {
  currentRate: number;
  currency: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(currentRate));
  const [effectiveFrom, setEffectiveFrom] = useState(
    format(startOfMonth(addMonths(new Date(), 1)), "yyyy-MM-dd"),
  );
  const [candidates, setCandidates] = useState<RateCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getRateCandidates().then((rows) => {
      setCandidates(rows);
      // Pre-select patients currently on the practice rate
      setSelected(
        new Set(rows.filter((r) => r.followsPracticeRate || r.currentRate === currentRate).map((r) => r.id)),
      );
    });
  }, [currentRate]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0;

  function handleConfirm() {
    if (!valid) return;
    startTransition(async () => {
      const result = await changePracticeRate({
        amount: value,
        effectiveFrom,
        patientIds: [...selected],
      });
      if (result.success) {
        toast.success(
          selected.size > 0
            ? `New rate scheduled for ${selected.size} patient${selected.size !== 1 ? "s" : ""}`
            : "Practice rate updated",
        );
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-rate">New rate ({currency})</Label>
          <Input
            id="new-rate"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effective-from">For selected patients, from</Label>
          <Input
            id="effective-from"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Patients moving to the new rate</Label>
          {candidates && candidates.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}
              >
                All
              </button>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setSelected(new Set())}
              >
                None
              </button>
            </div>
          )}
        </div>

        {candidates === null ? (
          <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading patients…
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No patients yet: the new rate applies to new patients.</p>
        ) : (
          <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.currentRate.toFixed(2)} {currency}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Patients not selected keep their current rate. New patients get the new rate right away.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={!valid || isPending || candidates === null}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm
        </Button>
      </div>
    </div>
  );
}
