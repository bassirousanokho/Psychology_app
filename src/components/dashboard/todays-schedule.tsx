"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { BookOpen, FileText, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodayAppointment = {
  id: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  patient: {
    firstName: string;
    lastName: string;
    backgroundNotes: string | null;
    previousNote: {
      sessionNotes: string | null;
      startTime: string; // ISO
    } | null;
  };
};

const STATUS_STYLES: Record<TodayAppointment["status"], string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
  NO_SHOW:   "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200",
};

// ── Prep Dialog ───────────────────────────────────────────────────────────────

function PrepDialog({
  appt,
  open,
  onOpenChange,
}: {
  appt: TodayAppointment;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const prev = appt.patient.previousNote;
  const { t, fmt } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("prep.title", { name: `${appt.patient.lastName}, ${appt.patient.firstName}` })}
          </DialogTitle>
          <DialogDescription>
            {t("prep.today", { start: fmt(appt.startTime, "HH:mm"), end: fmt(appt.endTime, "HH:mm") })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Patient background */}
          {appt.patient.backgroundNotes && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("prep.background")}
              </h4>
              <p className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {appt.patient.backgroundNotes}
              </p>
            </section>
          )}

          {/* Previous session notes */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("prep.previous")}
            </h4>
            {prev ? (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {fmt(prev.startTime, "EEEE d MMMM yyyy")}
                </p>
                <p className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {prev.sessionNotes || (
                    <span className="italic text-muted-foreground">{t("prep.noNotes")}</span>
                  )}
                </p>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground italic">
                {t("prep.noPrevious")}
              </p>
            )}
          </section>

          {/* Link to session workspace */}
          <div className="flex justify-end pt-2">
            <Button render={<Link href={`/dashboard/appointments/${appt.id}`} />}>
              <FileText className="mr-2 h-4 w-4" />
              {t("prep.open")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Today's Schedule widget ───────────────────────────────────────────────────

export function TodaysSchedule({ appointments }: { appointments: TodayAppointment[] }) {
  const [prepAppt, setPrepAppt] = useState<TodayAppointment | null>(null);
  const { t, tp, fmt } = useI18n();

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-1 font-semibold">{t("today.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("today.empty")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">{t("today.title")}</h3>
          <span className="text-xs text-muted-foreground">
            {tp(appointments.length, "today.count")}
          </span>
        </div>

        <ul className="divide-y">
          {appointments.map((appt) => (
            <li key={appt.id} className="flex items-center gap-4 px-5 py-3">
              {/* Time */}
              <div className="w-16 shrink-0 text-center">
                <p className="text-sm font-semibold tabular-nums">
                  {fmt(appt.startTime, "HH:mm")}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fmt(appt.endTime, "HH:mm")}
                </p>
              </div>

              {/* Patient info */}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {appt.patient.lastName}, {appt.patient.firstName}
                </p>
                <span
                  className={cn(
                    "inline-block mt-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    STATUS_STYLES[appt.status],
                  )}
                >
                  {t(`status.${appt.status}`)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {appt.status === "SCHEDULED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPrepAppt(appt)}
                    className="h-8 text-xs"
                  >
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                    {t("today.prep")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  render={<Link href={`/dashboard/appointments/${appt.id}`} />}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {prepAppt && (
        <PrepDialog
          appt={prepAppt}
          open={!!prepAppt}
          onOpenChange={(v) => { if (!v) setPrepAppt(null); }}
        />
      )}
    </>
  );
}
