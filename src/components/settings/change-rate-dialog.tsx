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
import { useI18n } from "@/i18n/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ChangeRateDialog({ currentRate, currency }: { currentRate: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("changeRate.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("changeRate.title")}</DialogTitle>
            <DialogDescription>{t("changeRate.body")}</DialogDescription>
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
  const { t, tp, tError, money } = useI18n();

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
        toast.success(selected.size > 0 ? tp(selected.size, "changeRate.scheduled") : t("changeRate.updated"));
        onDone();
      } else {
        toast.error(tError(result.error));
      }
    });
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-rate">{t("changeRate.newRate", { currency })}</Label>
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
          <Label htmlFor="effective-from">{t("changeRate.from")}</Label>
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
          <Label>{t("changeRate.patients")}</Label>
          {candidates && candidates.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}
              >
                {t("common.all")}
              </button>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setSelected(new Set())}
              >
                {t("common.none")}
              </button>
            </div>
          )}
        </div>

        {candidates === null ? (
          <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("changeRate.loading")}
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("changeRate.noPatients")}</p>
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
                    {money(c.currentRate, currency)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t("changeRate.footer")}
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={!valid || isPending || candidates === null}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.confirm")}
        </Button>
      </div>
    </div>
  );
}
