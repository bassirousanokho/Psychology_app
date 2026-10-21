import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { SettingsForm } from "@/components/settings/settings-form";
import { InvoiceSettings } from "@/components/settings/invoice-settings";
import { getSignedReadUrl } from "@/lib/gcs";
import { toLang, translate } from "@/i18n/core";
import { DEFAULT_REGION, REGIONS, type Region } from "@/lib/regions";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const workspace = await prisma.workspace.findUnique({
    where: { id: userId },
    select: {
      defaultTariff: true,
      hourlyRateAdmin: true,
      hourlyRateWriting: true,
      cancellationNoticeHours: true,
      cancellationAlertThreshold: true,
      retentionYears: true,
      region: true,
      language: true,
      sessionRemindersEnabled: true,
      patientSelfServiceEnabled: true,
      gstRate: true,
      qstRate: true,
      name: true,
      permitNumber: true,
      neq: true,
      gstNumber: true,
      qstNumber: true,
      practitionerName: true,
      professionalTitle: true,
      address: true,
      siret: true,
      adeli: true,
      rpps: true,
      vatMention: true,
      paymentTerms: true,
      invoiceNotes: true,
      invoiceHeaderKey: true,
      invoiceFooterKey: true,
      taxRate: true,
      currency: true,
      workingHoursStart: true,
      workingHoursEnd: true,
      workingDays: true,
    },
  });

  if (!workspace) redirect("/dashboard");

  const defaults = {
    name: workspace.name,
    language: (workspace.language === "en" ? "en" : "fr") as "fr" | "en",
    sessionRemindersEnabled: workspace.sessionRemindersEnabled,
    patientSelfServiceEnabled: workspace.patientSelfServiceEnabled,
    gstRate: Number(workspace.gstRate),
    qstRate: Number(workspace.qstRate),
    hourlyRateAdmin: Number(workspace.hourlyRateAdmin),
    hourlyRateWriting: Number(workspace.hourlyRateWriting),
    cancellationNoticeHours: workspace.cancellationNoticeHours,
    cancellationAlertThreshold: workspace.cancellationAlertThreshold,
    retentionYears: workspace.retentionYears,
    region: (REGIONS as readonly string[]).includes(workspace.region) ? (workspace.region as Region) : DEFAULT_REGION,
    taxRate: Number(workspace.taxRate),
    currency: workspace.currency,
    workingHoursStart: workspace.workingHoursStart,
    workingHoursEnd: workspace.workingHoursEnd,
    workingDays: workspace.workingDays,
  };

  return (
    <>
      <Header title={translate(toLang(workspace.language), "nav.settings")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <SettingsForm
            defaults={defaults}
            practiceRate={Number(workspace.defaultTariff)}
          />
          <InvoiceSettings
            region={workspace.region}
            workspaceName={workspace.name}
            headerUrl={workspace.invoiceHeaderKey ? await getSignedReadUrl(workspace.invoiceHeaderKey) : null}
            footerUrl={workspace.invoiceFooterKey ? await getSignedReadUrl(workspace.invoiceFooterKey) : null}
            defaults={{
              practitionerName: workspace.practitionerName ?? "",
              professionalTitle: workspace.professionalTitle ?? "",
              address: workspace.address ?? "",
              permitNumber: workspace.permitNumber ?? "",
              neq: workspace.neq ?? "",
              gstNumber: workspace.gstNumber ?? "",
              qstNumber: workspace.qstNumber ?? "",
              siret: workspace.siret ?? "",
              adeli: workspace.adeli ?? "",
              rpps: workspace.rpps ?? "",
              vatMention: workspace.vatMention ?? "",
              paymentTerms: workspace.paymentTerms ?? "",
              invoiceNotes: workspace.invoiceNotes ?? "",
            }}
          />
        </div>
      </main>
    </>
  );
}
