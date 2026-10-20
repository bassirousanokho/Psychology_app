import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Ban, CalendarDays, Clock } from "lucide-react";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { SessionEditor, type SessionAppointment } from "@/components/appointments/session-editor";
import { InvoicePanel, type InvoiceSummary } from "@/components/appointments/invoice-panel";
import { TimeSpentPicker } from "@/components/appointments/time-spent-picker";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentList } from "@/components/documents/document-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/tenant";
import { formatDuration, isHourly, SESSION_TYPE_LABELS } from "@/lib/session-types";

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

  // No deletedAt filter: notes stay available after a patient is deleted
  const raw = await prisma.appointment.findFirst({
    where: { id, workspaceId: userId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          backgroundNotes: true,
          deletedAt: true,
        },
      },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          publicToken: true,
          paidAt: true,
          receiptSentAt: true,
        },
      },
      documents: {
        where: { isSessionNote: true },
        orderBy: { createdAt: "asc" },
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

  const hourly = isHourly(raw.type);
  const noteFiles = raw.documents.map((d) => ({
    id: d.id,
    name: d.name,
    url: `/api/documents/${d.id}`,
    fileType: d.fileType,
    fileSize: d.fileSize,
    sharedWithPatient: false,
    isSessionNote: true,
    createdAt: d.createdAt.toISOString(),
  }));

  const appointment: SessionAppointment = {
    id: raw.id,
    sessionNotes:     decrypt(raw.sessionNotes),  // decrypt before sending to client
    noteCompletedAt:  raw.noteCompletedAt?.toISOString() ?? null,
    status:           raw.status,
    type:             raw.type,
    hasNoteFiles:     noteFiles.length > 0,
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
        paidAt: raw.invoice.paidAt?.toISOString() ?? null,
        receiptSentAt: raw.invoice.receiptSentAt?.toISOString() ?? null,
      }
    : null;

  const currency = raw.workspace.currency;
  const price = Number(raw.tariffAmount);
  const fee = raw.cancellationFee !== null ? Number(raw.cancellationFee) : null;
  const billable = raw.status === "COMPLETED" || (raw.status === "CANCELLED" && fee !== null && fee > 0);

  const start    = new Date(appointment.startTime);
  const end      = new Date(appointment.endTime);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <>
      <Header title="Session Notes" />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* ── Navigation ── */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              render={<Link href="/dashboard/calendar" />}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to calendar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              render={<Link href={`/dashboard/patients/${raw.patient.id}`} />}
            >
              Patient file
            </Button>
          </div>

          {raw.patient.deletedAt && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              This patient was deleted on {format(raw.patient.deletedAt, "d MMMM yyyy")}. Their
              session notes remain available here.
            </div>
          )}

          {/* ── Appointment header ── */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">
                  {appointment.patient.lastName}, {appointment.patient.firstName}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{SESSION_TYPE_LABELS[raw.type]}</span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {format(start, "EEEE d MMMM yyyy")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {format(start, "HH:mm")} – {format(end, "HH:mm")}
                    <span className="text-xs">({formatDuration(duration)})</span>
                  </span>
                  <span className="tabular-nums">
                    {price.toFixed(2)} {currency}
                    {hourly && raw.hourlyRate !== null && (
                      <span className="text-xs"> ({Number(raw.hourlyRate).toFixed(2)} {currency}/h)</span>
                    )}
                  </span>
                </div>
              </div>
              <Badge variant={STATUS_VARIANTS[appointment.status]}>
                {STATUS_LABELS[appointment.status]}
              </Badge>
            </div>

            {/* Hourly work: adjust the time spent until it's invoiced */}
            {hourly && !invoice && (raw.status === "SCHEDULED" || raw.status === "COMPLETED") && (
              <div className="mt-4 border-t pt-4">
                <TimeSpentPicker
                  appointmentId={raw.id}
                  startTime={appointment.startTime}
                  minutes={duration}
                  hourlyRate={Number(raw.hourlyRate ?? 0)}
                  currency={currency}
                />
              </div>
            )}
          </div>

          {/* ── Cancellation ── */}
          {raw.status === "CANCELLED" && (
            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 px-5 py-3 text-sm">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                Cancelled
                {raw.cancelledAt && ` on ${format(raw.cancelledAt, "d MMMM yyyy 'at' HH:mm")}`}
                {fee !== null && fee > 0
                  ? ` · cancellation fee ${fee.toFixed(2)} ${currency}`
                  : " · no fee"}
                .
              </p>
            </div>
          )}

          {/* ── Session editor (Client Component) ── */}
          {raw.status !== "CANCELLED" && <SessionEditor appointment={appointment} />}

          {/* ── Uploaded notes (instead of, or alongside, typed notes) ── */}
          {raw.status !== "CANCELLED" && (
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div>
                  <h2 className="font-semibold">Note files</h2>
                  <p className="text-xs text-muted-foreground">
                    Upload a scanned or written note instead of typing it. Never shared with the patient.
                  </p>
                </div>
                <DocumentUploader
                  patientId={raw.patient.id}
                  appointmentId={raw.id}
                  isSessionNote
                  label="Upload note"
                />
              </div>
              <DocumentList
                key={noteFiles.map((d) => d.id).join()}
                documents={noteFiles}
                emptyText="No note files. Type your notes above, or upload a note here."
              />
            </div>
          )}

          {/* ── Invoice panel (billable sessions, or any session already invoiced) ── */}
          {(billable || invoice) && (
            <InvoicePanel
              appointmentId={appointment.id}
              invoice={invoice}
              currency={currency}
              patientHasEmail={!!raw.patient.email}
            />
          )}

        </div>
      </main>
    </>
  );
}
