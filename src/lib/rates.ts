import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * A patient's psychotherapy rate on a given date: the latest scheduled change
 * effective on or before that date, else their individual rate, else the
 * practice default.
 */
export async function psychotherapyRate(patientId: string, onDate: Date): Promise<Prisma.Decimal> {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: {
      tariff: true,
      workspace: { select: { defaultTariff: true } },
      rateChanges: {
        where: { effectiveFrom: { lte: onDate } },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { amount: true },
      },
    },
  });
  return patient.rateChanges[0]?.amount ?? patient.tariff ?? patient.workspace.defaultTariff;
}
