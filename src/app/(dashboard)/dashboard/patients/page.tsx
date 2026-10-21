import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PatientTable } from "@/components/patients/patient-table";
import { CreatePatientButton } from "@/components/patients/patient-sheet";
import { DeletedPatients } from "@/components/patients/deleted-patients";
import { toPatientRow } from "@/components/patients/types";
import { getI18n } from "@/i18n/server";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { q = "", view } = await searchParams;
  const { t, tp } = await getI18n(userId);

  if (view === "deleted") {
    const deleted = await prisma.patient.findMany({
      where: { workspaceId: userId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        deletedAt: true,
        _count: { select: { invoices: true } },
      },
    });

    return (
      <>
        <Header title={t("nav.patients")} />
        <main className="flex-1 p-6 space-y-6">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              render={<Link href="/dashboard/patients" />}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("deleted.back")}
            </Button>
            <h2 className="mt-2 text-lg font-semibold">{t("deleted.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("deleted.description")}</p>
          </div>
          <DeletedPatients
            patients={deleted.map((p) => ({
              id: p.id,
              firstName: p.firstName,
              lastName: p.lastName,
              deletedAt: p.deletedAt!.toISOString(),
              invoiceCount: p._count.invoices,
            }))}
          />
        </main>
      </>
    );
  }

  const [patients, deletedCount, workspace] = await Promise.all([
    prisma.patient.findMany({
      where: { workspaceId: userId, deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.patient.count({ where: { workspaceId: userId, deletedAt: { not: null } } }),
    prisma.workspace.findUnique({
      where: { id: userId },
      select: { defaultTariff: true, currency: true, region: true },
    }),
  ]);
  const defaultTariffLabel = workspace
    ? `${Number(workspace.defaultTariff).toFixed(2)} ${workspace.currency}`
    : undefined;

  return (
    <>
      <Header title={t("nav.patients")} />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("patients.title")}</h2>
            <p className="text-sm text-muted-foreground">{tp(patients.length, "patients.count")}</p>
          </div>
          <div className="flex items-center gap-2">
            {deletedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                render={<Link href="/dashboard/patients?view=deleted" />}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t("patients.recentlyDeleted", { count: deletedCount })}
              </Button>
            )}
            <CreatePatientButton defaultTariffLabel={defaultTariffLabel} region={workspace?.region} />
          </div>
        </div>

        {/* key: a new header search re-initialises the table filter */}
        <PatientTable
          key={q}
          patients={patients.map(toPatientRow)}
          initialQuery={q}
          defaultTariffLabel={defaultTariffLabel}
          region={workspace?.region}
        />
      </main>
    </>
  );
}
