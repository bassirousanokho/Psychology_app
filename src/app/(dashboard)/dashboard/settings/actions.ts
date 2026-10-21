"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { REGIONS, regionConfig } from "@/lib/regions";

// The practice psychotherapy rate is changed through changePracticeRate (rates/actions.ts)
const settingsSchema = z.object({
  name: z.string().trim().min(1, "Practice name is required").max(120),
  region: z.enum(REGIONS),
  language: z.enum(["fr", "en"]),
  sessionRemindersEnabled: z.boolean(),
  patientSelfServiceEnabled: z.boolean(),
  patientCanWriteFirst: z.boolean(),
  practitionerEmailNotices: z.boolean(),
  gstRate: z.coerce.number().min(0).max(100),
  qstRate: z.coerce.number().min(0).max(100),
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

  // Québec: the rate applied to new sessions is GST + QST (shown as two lines on invoices)
  const taxRate =
    parsed.data.region === "CA-QC" ? parsed.data.gstRate + parsed.data.qstRate : parsed.data.taxRate;

  await prisma.workspace.update({
    where: { id: userId },
    data: { ...parsed.data, taxRate, ...extra },
  });

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
