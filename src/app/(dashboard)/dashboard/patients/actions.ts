"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { patientSchema, type PatientFormData } from "@/lib/schemas";

type ActionResult = { success: true } | { success: false; error: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createPatient(data: PatientFormData): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: "Invalid form data" };

  try {
    const workspaceId = await getOrgId();
    await prisma.patient.create({
      data: {
        workspaceId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        backgroundNotes: parsed.data.backgroundNotes || null,
      },
    });
    revalidatePath("/dashboard/patients");
    return { success: true };
  } catch (err) {
    console.error("[createPatient]", err);
    return { success: false, error: "Failed to create patient" };
  }
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function updatePatient(
  id: string,
  data: PatientFormData,
): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: "Invalid form data" };

  try {
    const workspaceId = await getOrgId();
    // updateMany with workspaceId ensures we never touch another tenant's row
    const result = await prisma.patient.updateMany({
      where: { id, workspaceId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        backgroundNotes: parsed.data.backgroundNotes || null,
      },
    });
    if (result.count === 0) return { success: false, error: "Patient not found" };
    revalidatePath("/dashboard/patients");
    return { success: true };
  } catch (err) {
    console.error("[updatePatient]", err);
    return { success: false, error: "Failed to update patient" };
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deletePatient(id: string): Promise<ActionResult> {
  try {
    const workspaceId = await getOrgId();
    const result = await prisma.patient.deleteMany({
      where: { id, workspaceId },
    });
    if (result.count === 0) return { success: false, error: "Patient not found" };
    revalidatePath("/dashboard/patients");
    return { success: true };
  } catch (err) {
    console.error("[deletePatient]", err);
    return { success: false, error: "Failed to delete patient" };
  }
}
