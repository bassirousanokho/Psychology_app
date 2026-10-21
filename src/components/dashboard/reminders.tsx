"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Archive, BellRing, Loader2 } from "lucide-react";
import { markRateChangeNotified } from "@/app/(dashboard)/dashboard/rates/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { formatMoney } from "@/lib/format";

export type RemindersData = {
  currency: string;
  locale: string;
  retentionYears: number;
  cancellationThreshold: number;
  rateChanges: {
    id: string;
    patientId: string;
    patientName: string;
    previousAmount: number;
    amount: number;
    effectiveFrom: string; // YYYY-MM-DD
  }[];
  cancellationAlerts: { patientId: string; patientName: string; count: number }[];
  inactivePatients: { patientId: string; patientName: string; lastActivity: string }[]; // ISO
  deletedPatients: { patientId: string; patientName: string; deletedAt: string }[];     // ISO
};

export function Reminders({ data }: { data: RemindersData }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const today = format(new Date(), "yyyy-MM-dd");
  const { t, fmt, tError } = useI18n();

  const total =
    data.rateChanges.length +
    data.cancellationAlerts.length +
    data.inactivePatients.length +
    data.deletedPatients.length;
  if (total === 0) return null;

  function markNotified(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await markRateChangeNotified(id);
      setBusyId(null);
      if (result.success) toast.success(t("reminders.markedInformed"));
      else toast.error(tError(result.error));
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <BellRing className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold">{t("reminders.title")}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{t("reminders.toReview", { count: total })}</span>
      </div>

      <div className="divide-y">
        {data.rateChanges.length > 0 && (
          <Section title={t("reminders.rates")}>
            {data.rateChanges.map((c) => {
              const late = c.effectiveFrom <= today;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Link href={`/dashboard/patients/${c.patientId}`} className="flex-1 min-w-0 truncate font-medium hover:underline">
                    {c.patientName}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(c.previousAmount, data.currency, data.locale)} → {formatMoney(c.amount, data.currency, data.locale)}
                  </span>
                  <span className={late ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                    {t(late ? "reminders.since" : "reminders.from", { date: fmt(`${c.effectiveFrom}T12:00:00`, "d MMM yyyy") })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busyId === c.id}
                    onClick={() => markNotified(c.id)}
                  >
                    {busyId === c.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {t("reminders.markInformed")}
                  </Button>
                </li>
              );
            })}
          </Section>
        )}

        {data.cancellationAlerts.length > 0 && (
          <Section title={t("reminders.cancellations", { threshold: data.cancellationThreshold })}>
            {data.cancellationAlerts.map((a) => (
              <li key={a.patientId} className="flex items-center gap-3 py-2 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <Link href={`/dashboard/patients/${a.patientId}`} className="flex-1 truncate font-medium hover:underline">
                  {a.patientName}
                </Link>
                <span className="text-xs text-muted-foreground">{t("reminders.cancellationCount", { count: a.count })}</span>
              </li>
            ))}
          </Section>
        )}

        {data.inactivePatients.length > 0 && (
          <Section title={t("reminders.inactive", { years: data.retentionYears })}>
            {data.inactivePatients.map((p) => (
              <li key={p.patientId} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`/dashboard/patients/${p.patientId}`} className="flex-1 truncate font-medium hover:underline">
                  {p.patientName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t("reminders.lastActivity", { date: fmt(p.lastActivity, "MMM yyyy") })}
                </span>
              </li>
            ))}
          </Section>
        )}

        {data.deletedPatients.length > 0 && (
          <Section title={t("reminders.deleted", { years: data.retentionYears })}>
            {data.deletedPatients.map((p) => (
              <li key={p.patientId} className="flex items-center gap-3 py-2 text-sm">
                <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{p.patientName}</span>
                <span className="text-xs text-muted-foreground">
                  {t("reminders.deletedOn", { date: fmt(p.deletedAt, "MMM yyyy") })}
                </span>
              </li>
            ))}
            <li className="pt-1">
              <Link href="/dashboard/patients?view=deleted" className="text-xs underline underline-offset-2">
                {t("reminders.openDeleted")}
              </Link>
            </li>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}
