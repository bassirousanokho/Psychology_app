import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, Mail, Phone } from "lucide-react";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentList } from "@/components/documents/document-list";
import { InviteButton } from "@/components/portal/invite-button";
import { audit } from "@/lib/tenant";

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
        take: 20,
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          tariffAmount: true,
          noteCompletedAt: true,
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
      portalUser: { select: { id: true } },
    },
  });

  if (!patient) notFound();

  // Fire-and-forget audit
  audit({
    workspaceId: userId,
    userId,
    action: "VIEW_PATIENT_NOTES",
    resourceType: "Patient",
    resourceId: id,
  });

  const docs = patient.documents.map((d) => ({
    id: d.id,
    name: d.name,
    url: d.url,
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

          {/* Patient header */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold">
                {patient.lastName}, {patient.firstName}
              </h1>
              <InviteButton
                patientId={patient.id}
                hasPortalAccess={!!patient.portalUser}
              />
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
                  {patient.phone}
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

          {/* Documents */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="font-semibold">Documents</h2>
              <DocumentUploader patientId={patient.id} />
            </div>
            <DocumentList documents={docs} />
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
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(appt.startTime, "HH:mm")} –{" "}
                        {format(appt.endTime, "HH:mm")} ·{" "}
                        {Number(appt.tariffAmount).toFixed(2)} €
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
