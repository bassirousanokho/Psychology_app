import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { InvoiceEditor } from "@/components/billing/invoice-editor";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { getI18n } from "@/i18n/server";
import { invoicePresets } from "@/lib/invoice-presets";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; appointment?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");
  const params = await searchParams;

  const [workspace, patients] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: userId },
      select: {
        currency: true,
        region: true,
        gstRate: true,
        qstRate: true,
        taxRate: true,
        defaultTariff: true,
        hourlyRateAdmin: true,
        hourlyRateWriting: true,
        hourlyRateConference: true,
      },
    }),
    prisma.patient.findMany({
      where: { workspaceId: userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  const { t } = await getI18n(userId);
  const patientId = patients.some((p) => p.id === params.patient) ? params.patient! : "";

  return (
    <>
      <Header title={t("invoiceEditor.newTitle")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href="/dashboard/billing" />}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("invoiceView.back")}
          </Button>
          <InvoiceEditor
            patients={patients}
            initialPatientId={patientId}
            initialLines={[]}
            initialDueDate={format(new Date(), "yyyy-MM-dd")}
            initialNotes=""
            preselectAppointmentId={params.appointment}
            currency={workspace.currency}
            region={workspace.region}
            gstRate={Number(workspace.gstRate)}
            qstRate={Number(workspace.qstRate)}
            defaultTaxRate={Number(workspace.taxRate)}
            presets={invoicePresets(workspace)}
          />
        </div>
      </main>
    </>
  );
}
