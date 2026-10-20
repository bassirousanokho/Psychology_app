import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { differenceInYears, format } from "date-fns";
import { AlertTriangle, ArrowLeft, Cake, CalendarDays, Mail, Phone, UserRound } from "lucide-react";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentList } from "@/components/documents/document-list";
import { InviteButton } from "@/components/portal/invite-button";
import { audit } from "@/lib/tenant";
import { formatPhone } from "@/lib/phone";
import { psychotherapyRate } from "@/lib/rates";
import { cancellationStats } from "@/lib/cancellations";
import { isHourly, SESSION_TYPE_LABELS } from "@/lib/session-types";
import { RateCard } from "@/components/patients/rate-card";
import { GENDER_LABELS } from "@/lib/schemas";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANTS = {
  SCHEDULED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW: "destructive",
} as const;

export default async function PatientProfilePage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const patient = await prisma.patient.findFirst({
    where: { id, workspaceId: userId },
    include: {
      appointments: {
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          type: true,
          tariffAmount: true,
          noteCompletedAt: true,
          cancelledAt: true,
          cancellationFee: true,
        },
      },
      rateChanges: { orderBy: { effectiveFrom: "desc" } },
      documents: {
        orderBy: { createdAt: "desc" },
      },
      portalUser: { select: { id: true } },
      workspace: { select: { currency: true, cancellationAlertThreshold: true } },
    },
  });

  if (!patient) notFound();

  const currency = patient.workspace.currency;
  const currentRate = Number(await psychotherapyRate(patient.id, new Date()));
  const cancellations = cancellationStats(patient.appointments);
  const threshold = patient.workspace.cancellationAlertThreshold;
  const cancellationAlert = cancellations.last30Days >= threshold;

  // Fire-and-forget audit
  audit({
    workspaceId: userId,
    userId,
    action: "VIEW_PATIENT_NOTES",
    resourceType: "Patient",
    resourceId: id,
  });

  // Opened through /api/documents/[id], which signs a fresh URL on each click
  const docs = patient.documents.map((d) => ({
      id: d.id,
      name: d.name,
      url: `/api/documents/${d.id}`,
      fileType: d.fileType,
      fileSize: d.fileSize,
      sharedWithPatient: d.sharedWithPatient,
      createdAt: d.createdAt.toISOString(),
    }));

  return (
    <>
      <Header title="Patient Profile" />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Back */}
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            render={<Link href="/dashboard/patients" />}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to patients
          </Button>

          {patient.deletedAt && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-amber-900 dark:text-amber-200">
                This patient was deleted on {format(patient.deletedAt, "d MMMM yyyy")}. Their
                history is kept read-only.
              </p>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/patients?view=deleted" />}
              >
                Recently deleted
              </Button>
            </div>
          )}

          {/* Patient header */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold">
                {patient.lastName}, {patient.firstName}
              </h1>
              {!patient.deletedAt && (
                <InviteButton
                  patientId={patient.id}
                  hasPortalAccess={!!patient.portalUser}
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              {patient.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {patient.email}
                </span>
              )}
              {patient.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(patient.phone)}
                </span>
              )}
              {patient.dateOfBirth && (
                <span className="flex items-center gap-1.5">
                  <Cake className="h-3.5 w-3.5" />
                  {format(patient.dateOfBirth, "d MMMM yyyy")} ({differenceInYears(new Date(), patient.dateOfBirth)} y/o)
                </span>
              )}
              {(patient.gender || patient.pronouns) && (
                <span className="flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  {[
                    patient.gender && GENDER_LABELS[patient.gender as keyof typeof GENDER_LABELS],
                    patient.pronouns,
                  ].filter(Boolean).join(" · ")}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Patient since {format(patient.createdAt, "MMMM yyyy")}
              </span>
            </div>
            {patient.backgroundNotes && (
              <div className="mt-4 rounded-lg bg-muted/40 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Background notes
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {patient.backgroundNotes}
                </p>
              </div>
            )}
          </div>

          {/* Contacts */}
          {(patient.emergencyContactName || patient.emergencyContactPhone || patient.doctorName || patient.doctorPhone) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ContactCard
                title="Emergency contact"
                name={patient.emergencyContactName}
                detail={patient.emergencyContactRelation}
                phone={patient.emergencyContactPhone}
              />
              <ContactCard title="Family doctor" name={patient.doctorName} phone={patient.doctorPhone} />
            </div>
          )}

          {/* Rate */}
          <RateCard
            patientId={patient.id}
            currentRate={currentRate}
            followsPracticeRate={patient.tariff === null && patient.rateChanges.length === 0}
            currency={currency}
            readOnly={!!patient.deletedAt}
            changes={patient.rateChanges.map((c) => ({
              id: c.id,
              amount: Number(c.amount),
              previousAmount: Number(c.previousAmount),
              effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
              notifiedAt: c.notifiedAt?.toISOString() ?? null,
            }))}
          />

          {/* Cancellations */}
          <div className={`rounded-xl border bg-card ${cancellationAlert ? "border-amber-300 dark:border-amber-800" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <h2 className="font-semibold">Cancellations</h2>
              {cancellationAlert && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {cancellations.last30Days} in the last 30 days (alert from {threshold})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
              <Stat label="Last 30 days" value={cancellations.last30Days} />
              <Stat label="This month" value={cancellations.thisMonth} />
              <Stat label="Last 12 months" value={cancellations.last12Months} hint={`${cancellations.withFee12Months} with fee`} />
              <Stat label="No-shows (12 months)" value={cancellations.noShows12Months} />
            </div>
            {cancellations.byMonth.length > 0 && (
              <div className="border-t px-5 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">By month</p>
                <div className="flex flex-wrap gap-2">
                  {cancellations.byMonth.map((m) => (
                    <span key={m.month} className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums">
                      {format(new Date(`${m.month}-01T00:00:00`), "MMM yyyy")}: {m.cancellations} cancelled
                      {m.noShows > 0 && `, ${m.noShows} no-show`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="font-semibold">Documents</h2>
              {!patient.deletedAt && <DocumentUploader patientId={patient.id} />}
            </div>
            <DocumentList key={docs.map((d) => d.id).join()} documents={docs} />
          </div>

          {/* Appointment history */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="font-semibold">Session history</h2>
            </div>
            {patient.appointments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <ul className="divide-y">
                {patient.appointments.map((appt) => (
                  <li key={appt.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {format(appt.startTime, "EEEE d MMMM yyyy")}
                        {isHourly(appt.type) && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {SESSION_TYPE_LABELS[appt.type]}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(appt.startTime, "HH:mm")} –{" "}
                        {format(appt.endTime, "HH:mm")} ·{" "}
                        {Number(appt.tariffAmount).toFixed(2)} {currency}
                        {appt.status === "CANCELLED" &&
                          (appt.cancellationFee
                            ? ` · cancellation fee ${Number(appt.cancellationFee).toFixed(2)} ${currency}`
                            : " · cancelled without fee")}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[appt.status]}>
                      {appt.status.charAt(0) + appt.status.slice(1).toLowerCase().replace("_", "-")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      render={<Link href={`/dashboard/appointments/${appt.id}`} />}
                    >
                      {appt.noteCompletedAt ? "View notes" : "Write notes"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </main>
    </>
  );
}

function ContactCard({
  title,
  name,
  detail,
  phone,
}: {
  title: string;
  name: string | null;
  detail?: string | null;
  phone: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      {name || phone ? (
        <>
          {name && (
            <p className="text-sm font-medium">
              {name}
              {detail && <span className="font-normal text-muted-foreground"> · {detail}</span>}
            </p>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-0.5 flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Phone className="h-3.5 w-3.5" />
              {formatPhone(phone)}
            </a>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Not provided</p>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
