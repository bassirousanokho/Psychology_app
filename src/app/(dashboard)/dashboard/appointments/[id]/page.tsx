import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
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
import { formatDuration, isHourly } from "@/lib/session-types";
import { makeI18n, toLang } from "@/i18n/core";
import { formatMoney, localeOf } from "@/lib/format";

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
        select: { currency: true, language: true, region: true },
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
  const lang = toLang(raw.workspace.language);
  const { t, fmt } = makeI18n(lang);
  const money = (n: number) => formatMoney(n, currency, localeOf(lang, raw.workspace.region));
  const price = Number(raw.tariffAmount);
  const fee = raw.cancellationFee !== null ? Number(raw.cancellationFee) : null;
  const billable = raw.status === "COMPLETED" || (raw.status === "CANCELLED" && fee !== null && fee > 0);

  const start    = new Date(appointment.startTime);
  const end      = new Date(appointment.endTime);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <>
      <Header title={t("nav.sessionNotes")} />

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
              {t("session.backToCalendar")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              render={<Link href={`/dashboard/patients/${raw.patient.id}`} />}
            >
              {t("session.patientFile")}
            </Button>
          </div>

          {raw.patient.deletedAt && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {t("session.deletedBanner", { date: fmt(raw.patient.deletedAt, "d MMMM yyyy") })}
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
                  <span className="font-medium text-foreground">{t(`type.${raw.type}`)}</span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {fmt(start, "EEEE d MMMM yyyy")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {fmt(start, "HH:mm")} – {fmt(end, "HH:mm")}
                    <span className="text-xs">({formatDuration(duration)})</span>
                  </span>
                  <span className="tabular-nums">
                    {money(price)}
                    {hourly && raw.hourlyRate !== null && (
                      <span className="text-xs"> {t("session.hourlyRate", { rate: money(Number(raw.hourlyRate)) })}</span>
                    )}
                  </span>
                </div>
              </div>
              <Badge variant={STATUS_VARIANTS[appointment.status]}>
                {t(`status.${appointment.status}`)}
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
                {raw.cancelledAt
                  ? t("session.cancelledOn", { date: fmt(raw.cancelledAt, "d MMMM yyyy, HH:mm") })
                  : t("session.cancelled")}
                {fee !== null && fee > 0 ? t("session.feeLine", { amount: money(fee) }) : t("session.noFee")}
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
                  <h2 className="font-semibold">{t("session.noteFiles")}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t("session.noteFilesHint")}
                  </p>
                </div>
                <DocumentUploader
                  patientId={raw.patient.id}
                  appointmentId={raw.id}
                  isSessionNote
                  label={t("session.uploadNote")}
                />
              </div>
              <DocumentList
                key={noteFiles.map((d) => d.id).join()}
                documents={noteFiles}
                emptyText={t("session.noteFilesEmpty")}
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
