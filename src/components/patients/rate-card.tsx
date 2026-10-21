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
import { useI18n } from "@/i18n/client";
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
  const { t, fmt, tError, money: formatAmount } = useI18n();
  const money = (n: number) => formatAmount(n, currency);

  function run(id: string, action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.success) toast.success(ok);
      else toast.error(tError(result.error));
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <h2 className="font-semibold">{t("rate.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("rate.today", { amount: money(currentRate) })}
            {followsPracticeRate && t("rate.practice")}
          </p>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("rate.schedule")}
          </Button>
        )}
      </div>

      {changes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t("rate.none")}</p>
      ) : (
        <ul className="divide-y">
          {changes.map((c) => {
            const upcoming = c.effectiveFrom > today;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium tabular-nums">
                    {money(c.previousAmount)} → {money(c.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(upcoming ? "rate.from" : "rate.since", { date: fmt(`${c.effectiveFrom}T12:00:00`, "d MMMM yyyy") })}
                  </p>
                </div>
                {c.notifiedAt ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("rate.informed", { date: fmt(c.notifiedAt, "d MMM") })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <BellRing className="h-3.5 w-3.5" />
                    {t("rate.notInformed")}
                  </span>
                )}
                {!readOnly && !c.notifiedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busyId === c.id}
                    onClick={() => run(c.id, () => markRateChangeNotified(c.id), t("rate.markedInformed"))}
                  >
                    {t("rate.markInformed")}
                  </Button>
                )}
                {!readOnly && upcoming && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    title={t("rate.cancelChange")}
                    disabled={busyId === c.id}
                    onClick={() => run(c.id, () => cancelRateChange(c.id), t("rate.cancelled"))}
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
            <DialogTitle>{t("rate.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("rate.dialogBody")}</DialogDescription>
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
  const { t, tError } = useI18n();
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0 && !!date;

  function handleSave() {
    startTransition(async () => {
      const result = await schedulePatientRateChange(patientId, value, date);
      if (result.success) {
        toast.success(t("rate.scheduled"));
        onDone();
      } else toast.error(tError(result.error));
    });
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rate-amount">{t("rate.newRate", { currency })}</Label>
          <Input id="rate-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate-date">{t("rate.fromLabel")}</Label>
          <Input id="rate-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>{t("common.cancel")}</Button>
        <Button onClick={handleSave} disabled={!valid || isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("rate.scheduleButton")}
        </Button>
      </div>
    </div>
  );
}
