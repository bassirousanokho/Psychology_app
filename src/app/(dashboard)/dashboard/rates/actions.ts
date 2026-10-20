"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { psychotherapyRate } from "@/lib/rates";

type ActionResult = { success: true } | { success: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validAmount(n: number) {
  return Number.isFinite(n) && n >= 0 && n < 100000;
}

/** Schedule a new psychotherapy rate for one patient from a date (replaces a change on the same date). */
export async function schedulePatientRateChange(
  patientId: string,
  amount: number,
  effectiveFrom: string,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!validAmount(amount)) return { success: false, error: "Enter a valid amount" };
  if (!DATE_RE.test(effectiveFrom)) return { success: false, error: "Pick a date" };

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found" };

  const date = new Date(effectiveFrom);
  await prisma.patientRateChange.deleteMany({ where: { patientId, effectiveFrom: date } });
  const previousAmount = await psychotherapyRate(patientId, date);
  await prisma.patientRateChange.create({
    data: { workspaceId: userId, patientId, amount, previousAmount, effectiveFrom: date },
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export type RateCandidate = {
  id: string;
  name: string;
  currentRate: number;
  followsPracticeRate: boolean;
};

/** Active patients with their rate today, for the "change practice rate" dialog. */
export async function getRateCandidates(): Promise<RateCandidate[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const patients = await prisma.patient.findMany({
    where: { workspaceId: userId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, tariff: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const today = new Date();
  return Promise.all(
    patients.map(async (p) => ({
      id: p.id,
      name: `${p.lastName}, ${p.firstName}`,
      currentRate: Number(await psychotherapyRate(p.id, today)),
      followsPracticeRate: p.tariff === null,
    })),
  );
}

/**
 * Change the practice rate. New patients get it immediately; the selected
 * existing patients get it from `effectiveFrom` (with a reminder to inform them);
 * everyone else keeps their current rate.
 */
export async function changePracticeRate(input: {
  amount: number;
  effectiveFrom: string;
  patientIds: string[];
}): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!validAmount(input.amount)) return { success: false, error: "Enter a valid amount" };
  if (input.patientIds.length > 0 && !DATE_RE.test(input.effectiveFrom)) {
    return { success: false, error: "Pick the date the new rate applies from" };
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: userId },
    select: { defaultTariff: true },
  });
  const selected = await prisma.patient.findMany({
    where: { id: { in: input.patientIds }, workspaceId: userId, deletedAt: null },
    select: { id: true },
  });
  const date = new Date(input.effectiveFrom);
  const previous = await Promise.all(selected.map((p) => psychotherapyRate(p.id, date)));

  await prisma.$transaction([
    // Patients following the practice rate are pinned to the old one, so nobody's
    // price changes without a scheduled (and announced) change
    prisma.patient.updateMany({
      where: { workspaceId: userId, tariff: null },
      data: { tariff: workspace.defaultTariff },
    }),
    prisma.patientRateChange.deleteMany({
      where: { patientId: { in: selected.map((p) => p.id) }, effectiveFrom: date },
    }),
    prisma.patientRateChange.createMany({
      data: selected.map((p, i) => ({
        workspaceId: userId,
        patientId: p.id,
        amount: input.amount,
        previousAmount: previous[i],
        effectiveFrom: date,
      })),
    }),
    prisma.workspace.update({ where: { id: userId }, data: { defaultTariff: input.amount } }),
  ]);

  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function markRateChangeNotified(id: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  const result = await prisma.patientRateChange.updateMany({
    where: { id, workspaceId: userId },
    data: { notifiedAt: new Date() },
  });
  if (result.count === 0) return { success: false, error: "Rate change not found" };
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

/** Cancel a change that hasn't taken effect yet. */
export async function cancelRateChange(id: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  const result = await prisma.patientRateChange.deleteMany({
    where: { id, workspaceId: userId, effectiveFrom: { gt: new Date() } },
  });
  if (result.count === 0) return { success: false, error: "Only upcoming changes can be cancelled" };
  revalidatePath("/dashboard", "layout");
  return { success: true };
}
