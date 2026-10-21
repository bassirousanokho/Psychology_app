import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, PenLine } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/billing/print-button";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/tenant";
import { answerText, parseFields, type Answers } from "@/lib/forms";
import { getI18n } from "@/i18n/server";

export default async function FormResponsePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const request = await prisma.formRequest.findFirst({
    where: { id, workspaceId: userId },
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!request) notFound();
  audit({ workspaceId: userId, userId, action: "VIEW_FORM_RESPONSE", resourceType: "FormRequest", resourceId: id });

  const { t, fmt, lang } = await getI18n(userId);
  const fields = parseFields(request.fields);
  let answers: Answers = {};
  try {
    answers = request.answers ? (JSON.parse(decrypt(request.answers) ?? "{}") as Answers) : {};
  } catch {
    answers = {};
  }

  return (
    <>
      <Header title={request.name} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              render={<Link href={`/dashboard/patients/${request.patient.id}`} />}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {request.patient.lastName}, {request.patient.firstName}
            </Button>
            {request.status === "COMPLETED" && <PrintButton />}
          </div>

          <div className="rounded-xl border bg-card p-6 print:border-none">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <h1 className="text-xl font-bold">{request.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {request.patient.firstName} {request.patient.lastName}
                  {request.completedAt && ` · ${t("formResponse.completedOn", { date: fmt(request.completedAt, "d MMMM yyyy, HH:mm") })}`}
                </p>
              </div>
              <Badge variant={request.status === "COMPLETED" ? "default" : "secondary"}>{t(`formStatus.${request.status}`)}</Badge>
            </div>

            {request.status !== "COMPLETED" ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("formResponse.notYet")}</p>
            ) : (
              <dl className="mt-4 space-y-4">
                {fields.map((f) =>
                  f.type === "heading" ? (
                    <h2 key={f.id} className="pt-2 text-base font-semibold">{f.label}</h2>
                  ) : f.type === "paragraph" ? (
                    <p key={f.id} className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{f.label}</p>
                  ) : (
                    <div key={f.id}>
                      <dt className="text-sm text-muted-foreground">{f.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm font-medium">{answerText(f, answers[f.id], lang)}</dd>
                    </div>
                  ),
                )}
              </dl>
            )}

            {request.signedAt && (
              <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="flex items-center gap-1.5 font-semibold">
                  <PenLine className="h-4 w-4" />
                  {t("formResponse.signature")}
                </p>
                <p className="mt-1 font-serif text-lg italic">{request.signatureName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("formResponse.signedOn", { date: fmt(request.signedAt, "d MMMM yyyy, HH:mm:ss") })}
                  {request.signerIp && ` · IP ${request.signerIp}`}
                </p>
                {request.signerUserAgent && <p className="mt-0.5 break-all text-[11px] text-muted-foreground">{request.signerUserAgent}</p>}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
