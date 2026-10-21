import Link from "next/link";

import { CalendarPlus } from "lucide-react";
import { requirePatientAuth } from "@/lib/patient-auth";
import { portalI18n } from "@/i18n/server";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalAppointmentActions } from "@/components/portal/appointment-actions";

const STATUS_VARIANTS = {
  SCHEDULED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW:   "destructive",
} as const;

export default async function PortalAppointmentsPage() {
  const session = await requirePatientAuth();
  const { t, tp, fmt, money } = portalI18n(session.workspace);

  const appointments = await prisma.appointment.findMany({
    where: {
      workspaceId: session.workspaceId,
      patientId: session.patientId,
    },
    orderBy: { startTime: "desc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      type: true,
      tariffAmount: true,
      cancellationFee: true,
      invoiceId: true,
      invoice: { select: { publicToken: true, status: true } },
    },
  });
  const ws = session.workspace;
  const now = new Date().getTime();
  const noticeMs = ws.cancellationNoticeHours * 3_600_000;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("portal.appointments")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tp(appointments.length, "portal.sessionsTotal")}
          </p>
        </div>
        <Button render={<Link href="/portal/book" />}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          {t("portal.bookSession")}
        </Button>
      </div>

      {ws.patientSelfServiceEnabled && (
        <p className="text-xs text-muted-foreground">
          {t("portal.policy", { hours: ws.cancellationNoticeHours })}
        </p>
      )}

      <div className="rounded-xl border bg-card">
        {appointments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {t("portal.noAppointments")}{" "}
            <Link href="/portal/book" className="underline underline-offset-2">
              {t("portal.bookFirst")}
            </Link>
          </p>
        ) : (
          <ul className="divide-y">
            {appointments.map((appt) => (
              <li key={appt.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {fmt(appt.startTime, "EEEE d MMMM yyyy")}
                    {appt.type !== "PSYCHOTHERAPY" && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {t(`type.${appt.type}`)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(appt.startTime, "HH:mm")} – {fmt(appt.endTime, "HH:mm")} ·{" "}
                    {money(Number(appt.tariffAmount), ws.currency)}
                    {appt.status === "CANCELLED" && appt.cancellationFee &&
                      ` · ${t("portal.feeCharged", { amount: money(Number(appt.cancellationFee), ws.currency) })}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                  {ws.patientSelfServiceEnabled &&
                    appt.status === "SCHEDULED" &&
                    appt.type === "PSYCHOTHERAPY" &&
                    !appt.invoiceId &&
                    appt.startTime.getTime() > now && (
                      <PortalAppointmentActions
                        id={appt.id}
                        startTime={appt.startTime.toISOString()}
                        noticeHours={ws.cancellationNoticeHours}
                        price={money(Number(appt.tariffAmount), ws.currency)}
                        canMove={appt.startTime.getTime() - now >= noticeMs}
                      />
                    )}
                  <Badge variant={STATUS_VARIANTS[appt.status]}>
                    {t(`status.${appt.status}`)}
                  </Badge>
                  {appt.invoice && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      render={
                        <Link
                          href={`/invoice/${appt.invoice.publicToken}`}
                          target="_blank"
                        />
                      }
                    >
                      {t("portal.invoice")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
