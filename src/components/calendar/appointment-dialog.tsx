"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { differenceInMinutes, format } from "date-fns";
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
import { isHourly, SESSION_TYPE_LABELS } from "@/lib/session-types";
import { BookingForm, type Availability } from "./booking-dialog";
import type { CalendarAppointment } from "./week-calendar";

const STATUS_LABELS: Record<CalendarAppointment["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

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

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(ok);
        onClose();
      } else {
        toast.error(result.error ?? "Something went wrong");
        setConfirm(null);
      }
    });
  }

  if (view === "reschedule") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Reschedule session</DialogTitle>
          <DialogDescription>Pick a new date, duration or start time.</DialogDescription>
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
          {hourly && <Badge variant="outline">{SESSION_TYPE_LABELS[appt.type]}</Badge>}
          <Badge variant={STATUS_VARIANTS[appt.status]}>{STATUS_LABELS[appt.status]}</Badge>
        </DialogTitle>
        <DialogDescription>
          {format(start, "EEEE d MMMM yyyy")} · {format(start, "HH:mm")}–{format(end, "HH:mm")} (
          {differenceInMinutes(end, start)} min)
        </DialogDescription>
      </DialogHeader>

      {confirm ? (
        <div className="space-y-4 pt-2">
          {confirm === "cancel" ? (
            <>
              <p className="text-sm">
                Cancel {patientName}&apos;s {hourly ? SESSION_TYPE_LABELS[appt.type].toLowerCase() : "session"}?
                {!hourly && " The slot becomes free again."}
              </p>
              {!hourly && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {hoursBefore > 0
                      ? `Cancelled ${formatNotice(hoursBefore)} before the session`
                      : "The session has already started"}
                    {" · "}your notice period is {cancellationNoticeHours} h
                    {hoursBefore > 0 && hoursBefore < cancellationNoticeHours && " (inside the notice period)"}.
                  </p>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={chargeFee}
                      onChange={(e) => setChargeFee(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Charge a cancellation fee
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
                        aria-label="Cancellation fee"
                      />
                      <span className="text-sm text-muted-foreground">{availability.currency}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm">Delete this session permanently? Use this only for a booking made by mistake.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={isPending}>
              Back
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending || (confirm === "cancel" && !feeValid)}
              onClick={() =>
                confirm === "cancel"
                  ? run(
                      () =>
                        updateAppointmentStatus(appt.id, "CANCELLED", {
                          cancellationFee: !hourly && chargeFee ? feeValue : null,
                        }),
                      !hourly && chargeFee && feeValue > 0
                        ? "Cancelled — fee to invoice from the session page"
                        : "Session cancelled",
                    )
                  : run(() => deleteAppointment(appt.id), "Session deleted")
              }
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm === "cancel" ? "Cancel session" : "Delete session"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pt-2">
          <Button className="w-full justify-start" render={<Link href={`/dashboard/appointments/${appt.id}`} />}>
            <FileText className="mr-2 h-4 w-4" />
            Open session notes
          </Button>

          {canMove && (
            <Button variant="outline" className="w-full justify-start" onClick={() => setView("reschedule")}>
              <CalendarClock className="mr-2 h-4 w-4" />
              Reschedule
            </Button>
          )}

          {isScheduled && started && (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={isPending}
              onClick={() => run(() => updateAppointmentStatus(appt.id, "NO_SHOW"), "Marked as no-show")}
            >
              <UserX className="mr-2 h-4 w-4" />
              Mark as no-show
            </Button>
          )}

          {isScheduled && (
            <Button variant="outline" className="w-full justify-start" onClick={() => setConfirm("cancel")}>
              <Ban className="mr-2 h-4 w-4" />
              Cancel session
            </Button>
          )}

          {isInactive && (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={isPending}
              onClick={() => run(() => updateAppointmentStatus(appt.id, "SCHEDULED"), "Session restored")}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore as scheduled
            </Button>
          )}

          {appt.status !== "COMPLETED" && !appt.invoiced && (
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => setConfirm("delete")}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete (booked by mistake)
            </Button>
          )}

          {(appt.status === "COMPLETED" || appt.invoiced) && (
            <p className="pt-1 text-xs text-muted-foreground">
              {appt.invoiced
                ? "This session is invoiced: open it to see the invoice."
                : "Completed sessions are changed from the session page (Reopen)."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function formatNotice(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}
