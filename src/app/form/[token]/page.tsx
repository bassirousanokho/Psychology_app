import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import prisma from "@/lib/prisma";
import { linkExpired, parseFields } from "@/lib/forms";
import { FormFiller } from "@/components/forms/form-filler";
import { I18nProvider } from "@/i18n/client";
import { portalI18n } from "@/i18n/server";
import { toLang } from "@/i18n/core";
import { localeOf } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Form opened from the private link emailed to the patient (no sign-in needed). */
export default async function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await prisma.formRequest.findUnique({
    where: { token },
    include: {
      patient: { select: { firstName: true, lastName: true, deletedAt: true } },
      workspace: { select: { name: true, practitionerName: true, language: true, region: true } },
    },
  });
  if (!request || request.patient.deletedAt) notFound();

  const ws = request.workspace;
  const lang = toLang(ws.language);
  const { t, fmt } = portalI18n(ws);
  const unavailable = request.status === "CANCELLED" || (request.status === "PENDING" && linkExpired(request.createdAt));

  return (
    <I18nProvider lang={lang} locale={localeOf(lang, ws.region)}>
      <div className="min-h-screen bg-muted/40 px-4 py-10" lang={lang}>
        <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {ws.practitionerName || ws.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold">{request.name}</h1>
          {request.description && request.status === "PENDING" && !unavailable && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{request.description}</p>
          )}

          <div className="mt-6">
            {request.status === "COMPLETED" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="font-semibold">{t("form.alreadyDone")}</p>
                {request.completedAt && (
                  <p className="text-sm text-muted-foreground">
                    {t("form.sentOn", { date: fmt(request.completedAt, "d MMMM yyyy, HH:mm") })}
                  </p>
                )}
              </div>
            ) : unavailable ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("form.unavailable")}</p>
            ) : (
              <FormFiller
                token={token}
                fields={parseFields(request.fields)}
                requiresSignature={request.requiresSignature}
                patientName={`${request.patient.firstName} ${request.patient.lastName}`}
              />
            )}
          </div>

          <p className="mt-8 flex items-center gap-1.5 border-t pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            {t("form.privacy")}
          </p>
        </div>
      </div>
    </I18nProvider>
  );
}
