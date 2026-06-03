import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { PatientTable } from "@/components/patients/patient-table";
import { CreatePatientButton } from "@/components/patients/patient-sheet";

export default async function PatientsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const patients = await prisma.patient.findMany({
    where: { workspaceId: userId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <>
      <Header title="Patients" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Patient records</h2>
            <p className="text-sm text-muted-foreground">
              {patients.length} patient{patients.length !== 1 ? "s" : ""} in this workspace
            </p>
          </div>
          <CreatePatientButton />
        </div>

        <PatientTable patients={patients} />
      </main>
    </>
  );
}
