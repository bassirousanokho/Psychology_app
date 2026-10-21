import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { differenceInYears } from "date-fns";
import { AlertTriangle, ArrowLeft, Cake, CalendarDays, Download, FilePlus2, Mail, MapPin, MessageSquare, Phone, UserRound } from "lucide-react";
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
import { isHourly } from "@/lib/session-types";
import { makeI18n, toLang } from "@/i18n/core";
import { formatMoney, localeOf } from "@/lib/format";
import { RateCard } from "@/components/patients/rate-card";
import { StatementCard } from "@/components/patients/statement-card";
import { PatientForms } from "@/components/patients/patient-forms";
import { decrypt } from "@/lib/crypto";

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
      messages: { orderBy: { createdAt: "desc" }, take: 3, include: { _count: { select: { attachments: true } } } },
      documents: {
        orderBy: { createdAt: "desc" },
      },
      portalUser: { select: { id: true } },
      formRequests: { orderBy: { createdAt: "desc" }, take: 50 },
      workspace: { select: { currency: true, cancellationAlertThreshold: true, language: true, region: true } },
    },
  });

  if (!patient) notFound();

  const formTemplates = await prisma.formTemplate.findMany({
    where: { workspaceId: userId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const currency = patient.workspace.currency;
  const lang = toLang(patient.workspace.language);
  const { t, fmt } = makeI18n(lang);
  const money = (n: number) => formatMoney(n, currency, localeOf(lang, patient.workspace.region));
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
      <Header title={t("nav.patientProfile")} />

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
            {t("profile.back")}
          </Button>

          {patient.deletedAt && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-amber-900 dark:text-amber-200">
                {t("profile.deletedBanner", { date: fmt(patient.deletedAt, "d MMMM yyyy") })}
              </p>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/patients?view=deleted" />}
              >
                {t("deleted.title")}
              </Button>
            </div>
          )}

          {/* Patient header */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold">
                {patient.lastName}, {patient.firstName}
              </h1>
              <div className="flex flex-wrap justify-end gap-2">
                {!patient.deletedAt && (
                  <Button variant="outline" size="sm" render={<Link href={`/dashboard/billing/new?patient=${patient.id}`} />}>
                    <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
                    {t("billing.new")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={`/api/export/patient/${patient.id}`} download />}
                  title={t("profile.exportHint")}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {t("profile.export")}
                </Button>
                {!patient.deletedAt && (
                  <InviteButton
                    patientId={patient.id}
                    hasPortalAccess={!!patient.portalUser}
                  />
                )}
              </div>
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
                  {fmt(patient.dateOfBirth, "d MMMM yyyy")} ({t("common.yearsOld", { years: differenceInYears(new Date(), patient.dateOfBirth) })})
                </span>
              )}
              {patient.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {patient.address.replace(/\n+/g, ", ")}
                </span>
              )}
              {(patient.gender || patient.pronouns) && (
                <span className="flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  {[
                    patient.gender && t(`gender.${patient.gender as "FEMALE" | "MALE" | "OTHER"}`),
                    patient.pronouns,
                  ].filter(Boolean).join(" · ")}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("profile.since", { date: fmt(patient.createdAt, "MMMM yyyy") })}
              </span>
            </div>
            {patient.backgroundNotes && (
              <div className="mt-4 rounded-lg bg-muted/40 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("profile.background")}
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
                title={t("profile.emergency")}
                notProvided={t("common.notProvided")}
                name={patient.emergencyContactName}
                detail={patient.emergencyContactRelation}
                phone={patient.emergencyContactPhone}
              />
              <ContactCard
                title={t("profile.doctor")}
                notProvided={t("common.notProvided")}
                name={patient.doctorName}
                phone={patient.doctorPhone}
              />
            </div>
          )}

          {/* Messages (inbox) */}
          <div className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  {t("messages.title")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {patient.portalUser
                    ? t("inbox.access.portal")
                    : patient.dateOfBirth
                    ? t("inbox.access.linkHint")
                    : t("inbox.access.none")}
                </p>
              </div>
              <Button size="sm" variant="outline" render={<Link href={`/dashboard/inbox/${patient.id}`} />}>
                {patient.messages.length ? t("inbox.openConversation") : t("inbox.write")}
              </Button>
            </div>
            {patient.messages.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t("messages.empty")}</p>
            ) : (
              <ul className="divide-y">
                {patient.messages.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{fmt(m.createdAt, "d MMM, HH:mm")}</span>
                    <p className={`min-w-0 flex-1 truncate ${m.direction === "FROM_PATIENT" && !m.readAt ? "font-semibold" : ""}`}>
                      {m.direction === "TO_PATIENT" ? `${t("inbox.you")} : ` : ""}
                      {m.subject ? `${m.subject} — ` : ""}
                      {(decrypt(m.body) ?? "").replace(/\s+/g, " ").slice(0, 120) || (m._count.attachments ? t("inbox.attachment") : "")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
              <h2 className="font-semibold">{t("profile.cancellations")}</h2>
              {cancellationAlert && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("profile.cancellationAlert", { count: cancellations.last30Days, threshold })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
              <Stat label={t("profile.stat.30days")} value={cancellations.last30Days} />
              <Stat label={t("profile.stat.month")} value={cancellations.thisMonth} />
              <Stat
                label={t("profile.stat.12months")}
                value={cancellations.last12Months}
                hint={t("profile.stat.withFee", { count: cancellations.withFee12Months })}
              />
              <Stat label={t("profile.stat.noShows")} value={cancellations.noShows12Months} />
            </div>
            {cancellations.byMonth.length > 0 && (
              <div className="border-t px-5 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("profile.byMonth")}</p>
                <div className="flex flex-wrap gap-2">
                  {cancellations.byMonth.map((m) => (
                    <span key={m.month} className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums">
                      {t("profile.monthLine", { month: fmt(`${m.month}-01T00:00:00`, "MMM yyyy"), count: m.cancellations })}
                      {m.noShows > 0 && t("profile.monthNoShow", { count: m.noShows })}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Intake, consent and other forms */}
          <PatientForms
            patientId={patient.id}
            templates={formTemplates}
            disabled={!!patient.deletedAt}
            requests={patient.formRequests.map((r) => ({
              id: r.id,
              name: r.name,
              status: r.status,
              token: r.token,
              signed: r.signedAt !== null,
              createdAt: r.createdAt.toISOString(),
              completedAt: r.completedAt?.toISOString() ?? null,
            }))}
          />

          {/* Statement of payments for insurance */}
          <StatementCard patientId={patient.id} patientHasEmail={!!patient.email} />

          {/* Documents */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="font-semibold">{t("profile.documents")}</h2>
              {!patient.deletedAt && <DocumentUploader patientId={patient.id} />}
            </div>
            <DocumentList key={docs.map((d) => d.id).join()} documents={docs} />
          </div>

          {/* Appointment history */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="font-semibold">{t("profile.history")}</h2>
            </div>
            {patient.appointments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t("profile.noSessions")}</p>
            ) : (
              <ul className="divide-y">
                {patient.appointments.map((appt) => (
                  <li key={appt.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {fmt(appt.startTime, "EEEE d MMMM yyyy")}
                        {isHourly(appt.type) && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {t(`type.${appt.type}`)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(appt.startTime, "HH:mm")} –{" "}
                        {fmt(appt.endTime, "HH:mm")} ·{" "}
                        {money(Number(appt.tariffAmount))}
                        {(appt.status === "CANCELLED" || appt.status === "NO_SHOW") &&
                          (appt.cancellationFee
                            ? ` · ${t("profile.feeCharged", { amount: money(Number(appt.cancellationFee)) })}`
                            : ` · ${t("profile.noFee")}`)}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[appt.status]}>
                      {t(`status.${appt.status}`)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      render={<Link href={`/dashboard/appointments/${appt.id}`} />}
                    >
                      {appt.noteCompletedAt ? t("profile.viewNotes") : t("profile.writeNotes")}
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
  notProvided,
  name,
  detail,
  phone,
}: {
  title: string;
  notProvided: string;
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
        <p className="text-sm text-muted-foreground">{notProvided}</p>
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
