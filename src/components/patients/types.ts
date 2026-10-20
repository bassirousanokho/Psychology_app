import type { Patient } from "@/generated/prisma/client";

/** Patient as passed to client components: Decimal fields serialised as strings. */
export type PatientRow = Omit<Patient, "tariff"> & { tariff: string | null };

export function toPatientRow(p: Patient): PatientRow {
  return { ...p, tariff: p.tariff?.toString() ?? null };
}
