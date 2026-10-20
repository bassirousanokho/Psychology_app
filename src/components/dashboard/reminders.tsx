"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Archive, BellRing, Loader2 } from "lucide-react";
import { markRateChangeNotified } from "@/app/(dashboard)/dashboard/rates/actions";
import { Button } from "@/components/ui/button";

export type RemindersData = {
  currency: string;
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
      if (result.success) toast.success("Marked as informed");
      else toast.error(result.error);
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <BellRing className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold">Reminders</h3>
        <span className="ml-auto text-xs text-muted-foreground">{total} to review</span>
      </div>

      <div className="divide-y">
        {data.rateChanges.length > 0 && (
          <Section title="Rate changes to announce">
            {data.rateChanges.map((c) => {
              const late = c.effectiveFrom <= today;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Link href={`/dashboard/patients/${c.patientId}`} className="flex-1 min-w-0 truncate font-medium hover:underline">
                    {c.patientName}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    {c.previousAmount.toFixed(2)} → {c.amount.toFixed(2)} {data.currency}
                  </span>
                  <span className={late ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                    {late ? "since" : "from"} {format(new Date(c.effectiveFrom), "d MMM yyyy")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busyId === c.id}
                    onClick={() => markNotified(c.id)}
                  >
                    {busyId === c.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Mark informed
                  </Button>
                </li>
              );
            })}
          </Section>
        )}

        {data.cancellationAlerts.length > 0 && (
          <Section title={`Frequent cancellations (${data.cancellationThreshold}+ in 30 days)`}>
            {data.cancellationAlerts.map((a) => (
              <li key={a.patientId} className="flex items-center gap-3 py-2 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <Link href={`/dashboard/patients/${a.patientId}`} className="flex-1 truncate font-medium hover:underline">
                  {a.patientName}
                </Link>
                <span className="text-xs text-muted-foreground">{a.count} cancellations</span>
              </li>
            ))}
          </Section>
        )}

        {data.inactivePatients.length > 0 && (
          <Section title={`No session for ${data.retentionYears}+ years: consider deleting`}>
            {data.inactivePatients.map((p) => (
              <li key={p.patientId} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`/dashboard/patients/${p.patientId}`} className="flex-1 truncate font-medium hover:underline">
                  {p.patientName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  last activity {format(new Date(p.lastActivity), "MMM yyyy")}
                </span>
              </li>
            ))}
          </Section>
        )}

        {data.deletedPatients.length > 0 && (
          <Section title={`In Recently deleted for ${data.retentionYears}+ years: delete permanently`}>
            {data.deletedPatients.map((p) => (
              <li key={p.patientId} className="flex items-center gap-3 py-2 text-sm">
                <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{p.patientName}</span>
                <span className="text-xs text-muted-foreground">
                  deleted {format(new Date(p.deletedAt), "MMM yyyy")}
                </span>
              </li>
            ))}
            <li className="pt-1">
              <Link href="/dashboard/patients?view=deleted" className="text-xs underline underline-offset-2">
                Open Recently deleted
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
