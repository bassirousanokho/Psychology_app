import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

export type PatientSession = {
  clerkUserId: string;
  patientId: string;
  workspaceId: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  workspace: {
    id: string;
    name: string;
    currency: string;
    defaultTariff: number;
    taxRate: number;
    workingDays: number[];
    workingHoursStart: string;
    workingHoursEnd: string;
  };
};

/**
 * Validates that the current Clerk user is a registered patient.
 * Redirects to /portal/sign-in if not authenticated,
 * or /portal/no-access if authenticated but not linked to a patient record.
 */
export async function requirePatientAuth(): Promise<PatientSession> {
  const { userId } = await auth();

  if (!userId) redirect("/portal/sign-in");

  // Practitioner — has a Workspace record (auto-created on sign-up)
  const isPractitioner = await prisma.workspace.findUnique({ where: { id: userId }, select: { id: true } });
  if (isPractitioner) redirect("/dashboard");

  const pu = await prisma.patientUser.findUnique({
    where: { clerkUserId: userId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
      workspace: {
        select: {
          id: true,
          name: true,
          currency: true,
          defaultTariff: true,
          taxRate: true,
          workingDays: true,
          workingHoursStart: true,
          workingHoursEnd: true,
        },
      },
    },
  });

  if (!pu) redirect("/portal/no-access");

  return {
    clerkUserId: pu.clerkUserId,
    patientId: pu.patientId,
    workspaceId: pu.workspaceId,
    patient: pu.patient,
    workspace: {
      ...pu.workspace,
      defaultTariff: Number(pu.workspace.defaultTariff),
      taxRate: Number(pu.workspace.taxRate),
    },
  };
}
