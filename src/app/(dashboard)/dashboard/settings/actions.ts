"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/tenant";
import { REGIONS, regionConfig } from "@/lib/regions";

// The practice psychotherapy rate is changed through changePracticeRate (rates/actions.ts)
const settingsSchema = z.object({
  region: z.enum(REGIONS),
  hourlyRateAdmin: z.coerce.number().min(0, "Must be 0 or greater"),
  hourlyRateWriting: z.coerce.number().min(0, "Must be 0 or greater"),
  cancellationNoticeHours: z.coerce.number().int().min(0).max(720, "At most 30 days"),
  cancellationAlertThreshold: z.coerce.number().int().min(1, "At least 1").max(50),
  retentionYears: z.coerce.number().int().min(1, "At least 1 year").max(50),
  taxRate: z.coerce.number().min(0).max(100, "Must be between 0 and 100"),
  currency: z.string().min(1),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  workingDays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Select at least one working day"),
}).refine((d) => d.workingHoursEnd > d.workingHoursStart, {
  message: "Day must end after it starts",
  path: ["workingHoursEnd"],
});

export type SettingsFormData = z.infer<typeof settingsSchema>;

export async function updateSettings(data: SettingsFormData) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  // Switching region: pre-filled mentions that were never edited follow the new region
  const current = await prisma.workspace.findUniqueOrThrow({
    where: { id: userId },
    select: { region: true, vatMention: true, paymentTerms: true },
  });
  const extra: { vatMention?: string; paymentTerms?: string } = {};
  if (current.region !== parsed.data.region) {
    const from = regionConfig(current.region);
    const to = regionConfig(parsed.data.region);
    if (!current.vatMention || current.vatMention === from.taxMention) extra.vatMention = to.taxMention;
    if (!current.paymentTerms || current.paymentTerms === from.paymentTerms) extra.paymentTerms = to.paymentTerms;
  }

  await prisma.workspace.update({
    where: { id: userId },
    data: { ...parsed.data, ...extra },
  });

  revalidatePath("/dashboard", "layout");
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
          type: true,
          cancelledAt: true,
          cancellationFee: true,
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
    dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: p.gender,
    pronouns: p.pronouns,
    address: p.address,
    emergencyContact: {
      name: p.emergencyContactName,
      relation: p.emergencyContactRelation,
      phone: p.emergencyContactPhone,
    },
    familyDoctor: { name: p.doctorName, phone: p.doctorPhone },
    sessionRate: p.tariff !== null ? Number(p.tariff) : null,
    backgroundNotes: p.backgroundNotes,
    createdAt: p.createdAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString() ?? null,
    appointments: p.appointments.map((a) => ({
      id: a.id,
      startTime: a.startTime.toISOString(),
      endTime: a.endTime.toISOString(),
      status: a.status,
      type: a.type,
      cancelledAt: a.cancelledAt?.toISOString() ?? null,
      cancellationFee: a.cancellationFee !== null ? Number(a.cancellationFee) : null,
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
