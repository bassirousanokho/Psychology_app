import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { SessionEditor, type SessionAppointment } from "@/components/appointments/session-editor";
import { InvoicePanel, type InvoiceSummary } from "@/components/appointments/invoice-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/tenant";

const STATUS_LABELS = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW:   "No-show",
} as const;

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  SCHEDULED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW:   "destructive",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AppointmentPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const raw = await prisma.appointment.findFirst({
    where: { id, workspaceId: userId },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
          backgroundNotes: true,
        },
      },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          publicToken: true,
        },
      },
      workspace: {
        select: { currency: true },
      },
    },
  });

  if (!raw) notFound();

  // Audit the note view (fire-and-forget)
  audit({
    workspaceId: userId,
    userId,
    action: "VIEW_PATIENT_NOTES",
    resourceType: "Appointment",
    resourceId: id,
  });

  const appointment: SessionAppointment = {
    id: raw.id,
    sessionNotes:     decrypt(raw.sessionNotes),  // decrypt before sending to client
    noteCompletedAt:  raw.noteCompletedAt?.toISOString() ?? null,
    status:           raw.status,
    startTime:        raw.startTime.toISOString(),
    endTime:          raw.endTime.toISOString(),
    patient:          raw.patient,
  };

  const invoice: InvoiceSummary | null = raw.invoice
    ? {
        id: raw.invoice.id,
        invoiceNumber: raw.invoice.invoiceNumber,
        totalAmount: Number(raw.invoice.totalAmount),
        status: raw.invoice.status as InvoiceSummary["status"],
        publicToken: raw.invoice.publicToken,
      }
    : null;

  const currency = raw.workspace.currency;

  const start    = new Date(appointment.startTime);
  const end      = new Date(appointment.endTime);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <>
      <Header title="Session Notes" />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* ── Navigation ── */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              render={<Link href="/dashboard/calendar" />}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to calendar
            </Button>
          </div>

          {/* ── Appointment header ── */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">
                  {appointment.patient.lastName}, {appointment.patient.firstName}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {format(start, "EEEE d MMMM yyyy")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {format(start, "HH:mm")} – {format(end, "HH:mm")}
                    <span className="text-xs">({duration} min)</span>
                  </span>
                </div>
              </div>
              <Badge variant={STATUS_VARIANTS[appointment.status]}>
                {STATUS_LABELS[appointment.status]}
              </Badge>
            </div>
          </div>

          {/* ── Session editor (Client Component) ── */}
          <SessionEditor appointment={appointment} />

          {/* ── Invoice panel (COMPLETED only) ── */}
          {appointment.status === "COMPLETED" && (
            <InvoicePanel
              appointmentId={appointment.id}
              invoice={invoice}
              currency={currency}
            />
          )}

        </div>
      </main>
    </>
  );
}
