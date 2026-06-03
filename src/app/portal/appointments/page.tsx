import Link from "next/link";
import { format } from "date-fns";
import { CalendarPlus } from "lucide-react";
import { requirePatientAuth } from "@/lib/patient-auth";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_VARIANTS = {
  SCHEDULED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW:   "destructive",
} as const;

const STATUS_LABELS = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW:   "No-show",
} as const;

export default async function PortalAppointmentsPage() {
  const session = await requirePatientAuth();

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
      tariffAmount: true,
      invoice: { select: { publicToken: true, status: true } },
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {appointments.length} session{appointments.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button render={<Link href="/portal/book" />}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          Book session
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        {appointments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No appointments yet.{" "}
            <Link href="/portal/book" className="underline underline-offset-2">
              Book your first session.
            </Link>
          </p>
        ) : (
          <ul className="divide-y">
            {appointments.map((appt) => (
              <li key={appt.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {format(appt.startTime, "EEEE d MMMM yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(appt.startTime, "HH:mm")} – {format(appt.endTime, "HH:mm")} ·{" "}
                    {Number(appt.tariffAmount).toFixed(2)} {session.workspace.currency}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANTS[appt.status]}>
                    {STATUS_LABELS[appt.status]}
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
                      Invoice
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
