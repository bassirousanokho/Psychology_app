"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  UserX,
} from "lucide-react";
import {
  cancelFollowingInSeries,
  countFollowingInSeries,
  deleteAppointment,
  updateAppointmentStatus,
} from "@/app/(dashboard)/dashboard/calendar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isHourly } from "@/lib/session-types";
import { useI18n } from "@/i18n/client";
import type { I18n } from "@/i18n/core";
import { BookingForm, type Availability } from "./booking-dialog";
import type { CalendarAppointment } from "./week-calendar";

const STATUS_VARIANTS: Record<
  CalendarAppointment["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  SCHEDULED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW: "destructive",
};

type Confirm = "cancel" | "delete" | null;

interface AppointmentDialogProps {
  appointment: CalendarAppointment | null;
  availability: Availability;
  cancellationNoticeHours: number;
  onOpenChange: (open: boolean) => void;
}

export function AppointmentDialog({
  appointment,
  availability,
  cancellationNoticeHours,
  onOpenChange,
}: AppointmentDialogProps) {
  return (
    <Dialog open={!!appointment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed so each opened session starts on the details view */}
        {appointment && (
          <AppointmentPanel
            key={appointment.id}
            appointment={appointment}
            availability={availability}
            cancellationNoticeHours={cancellationNoticeHours}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppointmentPanel({
  appointment: appt,
  availability,
  cancellationNoticeHours,
  onClose,
}: {
  appointment: CalendarAppointment;
  availability: Availability;
  cancellationNoticeHours: number;
  onClose: () => void;
}) {
  const [view, setView] = useState<"details" | "reschedule">("details");
  const { t, tp, fmt, tError } = useI18n();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [isPending, startTransition] = useTransition();

  const start = new Date(appt.startTime);
  const end = new Date(appt.endTime);
  const patientName = `${appt.patient.firstName} ${appt.patient.lastName}`;
  const started = start <= new Date();
  const hourly = isHourly(appt.type);
  const isScheduled = appt.status === "SCHEDULED" && !appt.invoiced;
  const isInactive = (appt.status === "CANCELLED" || appt.status === "NO_SHOW") && !appt.invoiced;
  const canMove = !appt.invoiced && (appt.status === "SCHEDULED" || (hourly && appt.status === "COMPLETED"));

  // Cancellation fee: charged by default (the practitioner decides whether the
  // cancellation is late), pre-filled with the session price
  const [chargeFee, setChargeFee] = useState(true);
  const [fee, setFee] = useState(appt.price.toFixed(2));
  const [openedAt] = useState(() => Date.now()); // render must stay pure
  const hoursBefore = (start.getTime() - openedAt) / 3_600_000;
  const feeValue = Number(fee);
  const feeValid = !chargeFee || (fee.trim() !== "" && Number.isFinite(feeValue) && feeValue >= 0);

  // Series: offer to cancel the following sessions too
  const [followingCount, setFollowingCount] = useState(0);
  const [cancelFollowing, setCancelFollowing] = useState(false);

  function openCancel() {
    setConfirm("cancel");
    if (appt.seriesId) countFollowingInSeries(appt.id).then(setFollowingCount);
  }

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(ok);
        onClose();
      } else {
        toast.error(tError(result.error));
        setConfirm(null);
      }
    });
  }

  if (view === "reschedule") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("panel.rescheduleTitle")}</DialogTitle>
          <DialogDescription>{t("panel.rescheduleBody")}</DialogDescription>
        </DialogHeader>
        <BookingForm
          patients={[]}
          availability={availability}
          reschedule={{
            appointmentId: appt.id,
            patientName,
            type: appt.type,
            start,
            durationMin: differenceInMinutes(end, start),
          }}
          onDone={onClose}
          onCancel={() => setView("details")}
        />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {appt.patient.lastName}, {appt.patient.firstName}
          {hourly && <Badge variant="outline">{t(`type.${appt.type}`)}</Badge>}
          <Badge variant={STATUS_VARIANTS[appt.status]}>{t(`status.${appt.status}`)}</Badge>
        </DialogTitle>
        <DialogDescription>
          {fmt(start, "EEEE d MMMM yyyy")} · {fmt(start, "HH:mm")}–{fmt(end, "HH:mm")} (
          {t("common.min", { count: differenceInMinutes(end, start) })})
        </DialogDescription>
      </DialogHeader>

      {confirm ? (
        <div className="space-y-4 pt-2">
          {confirm === "cancel" ? (
            <>
              <p className="text-sm">
                {hourly
                  ? t("panel.cancelQuestionHourly", { name: patientName, type: t(`type.${appt.type}`).toLowerCase() })
                  : t("panel.cancelQuestion", { name: patientName })}
                {!hourly && t("panel.slotFree")}
              </p>
              {!hourly && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {hoursBefore > 0
                      ? t("panel.cancelledBefore", { notice: formatNotice(hoursBefore, t) })
                      : t("panel.alreadyStarted")}
                    {t("panel.notice", { hours: cancellationNoticeHours })}
                    {hoursBefore > 0 && hoursBefore < cancellationNoticeHours && t("panel.insideNotice")}.
                  </p>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={chargeFee}
                      onChange={(e) => setChargeFee(e.target.checked)}
                      className="h-4 w-4"
                    />
                    {t("panel.chargeFee")}
                  </label>
                  {chargeFee && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                        className="h-8 w-32"
                        aria-label={t("panel.fee")}
                      />
                      <span className="text-sm text-muted-foreground">{availability.currency}</span>
                    </div>
                  )}
                </div>
              )}
              {followingCount > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cancelFollowing}
                    onChange={(e) => setCancelFollowing(e.target.checked)}
                    className="h-4 w-4"
                  />
                  {tp(followingCount, "panel.alsoFollowing")}
                </label>
              )}
            </>
          ) : (
            <p className="text-sm">{t("panel.deleteQuestion")}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={isPending}>
              {t("common.back")}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending || (confirm === "cancel" && !feeValid)}
              onClick={() =>
                confirm === "cancel"
                  ? run(
                      async () => {
                        const result = await updateAppointmentStatus(appt.id, "CANCELLED", {
                          cancellationFee: !hourly && chargeFee ? feeValue : null,
                        });
                        if (result.success && cancelFollowing && followingCount > 0) {
                          const following = await cancelFollowingInSeries(appt.id);
                          if (!following.success) return following;
                        }
                        return result;
                      },
                      cancelFollowing && followingCount > 0
                        ? t("panel.cancelledMany", { count: followingCount + 1 })
                        : !hourly && chargeFee && feeValue > 0
                        ? t("panel.cancelledWithFee")
                        : t("panel.cancelled"),
                    )
                  : run(() => deleteAppointment(appt.id), t("panel.deleted"))
              }
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm === "cancel" ? t("panel.cancelSession") : t("panel.deleteSession")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pt-2">
          <Button className="w-full justify-start" render={<Link href={`/dashboard/appointments/${appt.id}`} />}>
            <FileText className="mr-2 h-4 w-4" />
            {t("panel.openNotes")}
          </Button>

          {canMove && (
            <Button variant="outline" className="w-full justify-start" onClick={() => setView("reschedule")}>
              <CalendarClock className="mr-2 h-4 w-4" />
              {t("panel.reschedule")}
            </Button>
          )}

          {isScheduled && started && (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={isPending}
              onClick={() => run(() => updateAppointmentStatus(appt.id, "NO_SHOW"), t("panel.markedNoShow"))}
            >
              <UserX className="mr-2 h-4 w-4" />
              {t("panel.markNoShow")}
            </Button>
          )}

          {isScheduled && (
            <Button variant="outline" className="w-full justify-start" onClick={openCancel}>
              <Ban className="mr-2 h-4 w-4" />
              {t("panel.cancelSession")}
            </Button>
          )}

          {isInactive && (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={isPending}
              onClick={() => run(() => updateAppointmentStatus(appt.id, "SCHEDULED"), t("panel.restored"))}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("panel.restore")}
            </Button>
          )}

          {appt.status !== "COMPLETED" && !appt.invoiced && (
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => setConfirm("delete")}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("panel.deleteMistake")}
            </Button>
          )}

          {(appt.status === "COMPLETED" || appt.invoiced) && (
            <p className="pt-1 text-xs text-muted-foreground">
              {appt.invoiced
                ? t("panel.invoicedHint")
                : t("panel.completedHint")}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function formatNotice(hours: number, t: I18n["t"]): string {
  if (hours < 1) return t("notice.minutes", { count: Math.max(1, Math.round(hours * 60)) });
  if (hours < 48) return t("notice.hours", { count: Math.round(hours) });
  return t("notice.days", { count: Math.round(hours / 24) });
}
