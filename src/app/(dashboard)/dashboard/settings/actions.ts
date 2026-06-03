"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/tenant";

const settingsSchema = z.object({
  defaultTariff: z.coerce.number().min(0, "Must be 0 or greater"),
  taxRate: z.coerce.number().min(0).max(100, "Must be between 0 and 100"),
  currency: z.string().min(1),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  workingDays: z.array(z.coerce.number().int().min(1).max(7)),
});

export type SettingsFormData = z.infer<typeof settingsSchema>;

export async function updateSettings(data: SettingsFormData) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const { defaultTariff, taxRate, currency, workingHoursStart, workingHoursEnd, workingDays } =
    parsed.data;

  await prisma.workspace.update({
    where: { id: userId },
    data: { defaultTariff, taxRate, currency, workingHoursStart, workingHoursEnd, workingDays },
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}

// ── Export all patient data (GDPR data portability) ───────────────────────────

export async function exportPatientData() {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const patients = await prisma.patient.findMany({
    where: { workspaceId: userId },
    include: {
      appointments: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          tariffAmount: true,
          taxRate: true,
          noteCompletedAt: true,
          // sessionNotes intentionally excluded — they are encrypted and sensitive
        },
      },
      invoices: {
        select: {
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          dueDate: true,
          paidAt: true,
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const exportData = patients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    dateOfBirth: p.dateOfBirth?.toISOString() ?? null,
    backgroundNotes: p.backgroundNotes,
    createdAt: p.createdAt.toISOString(),
    appointments: p.appointments.map((a) => ({
      id: a.id,
      startTime: a.startTime.toISOString(),
      endTime: a.endTime.toISOString(),
      status: a.status,
      tariffAmount: Number(a.tariffAmount),
      noteCompletedAt: a.noteCompletedAt?.toISOString() ?? null,
    })),
    invoices: p.invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      dueDate: inv.dueDate.toISOString(),
      paidAt: inv.paidAt?.toISOString() ?? null,
    })),
  }));

  audit({
    workspaceId: userId,
    userId,
    action: "EXPORT_PATIENT_DATA",
    resourceType: "Patient",
    resourceId: userId,
    metadata: { count: patients.length },
  });

  return { success: true as const, data: exportData };
}
