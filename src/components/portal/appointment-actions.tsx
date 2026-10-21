"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, Loader2, X } from "lucide-react";
import { cancelMyAppointment } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";

interface Props {
  id: string;
  startTime: string; // ISO
  noticeHours: number;
  price: string; // session price, formatted: the late cancellation fee
  canMove: boolean; // outside the notice period: can still be moved online
}

/** Cancel or move an upcoming session from the portal. */
export function PortalAppointmentActions({ id, startTime, noticeHours, price, canMove }: Props) {
  const { t, fmt, tError } = useI18n();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Checked when the patient acts (render must stay pure)
  const [late, setLate] = useState(false);

  function openCancel() {
    setLate(new Date(startTime).getTime() - Date.now() < noticeHours * 3_600_000);
    setOpen(true);
  }

  function confirm() {
    startTransition(async () => {
      const result = await cancelMyAppointment(id);
      if (result.success) {
        toast.success(result.fee ? t("portal.cancelledLate") : t("portal.cancelled"));
        setOpen(false);
      } else {
        toast.error(tError(result.error));
      }
    });
  }

  return (
    <>
      {canMove ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href={`/portal/book?reschedule=${id}`} />}>
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          {t("portal.move")}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled title={t("portal.moveHint", { hours: noticeHours })}>
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          {t("portal.move")}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={openCancel}>
        <X className="mr-1 h-3.5 w-3.5" />
        {t("common.cancel")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("portal.cancelTitle")}</DialogTitle>
            <DialogDescription>{fmt(startTime, "EEEE d MMMM yyyy, HH:mm")}</DialogDescription>
          </DialogHeader>
          {late ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {t("portal.lateWarning", { hours: noticeHours, price })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("portal.cancelBody")}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("portal.keep")}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("portal.confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
