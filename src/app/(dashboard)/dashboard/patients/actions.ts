"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { patientSchema, type PatientFormData } from "@/lib/schemas";
import { normalizePhone } from "@/lib/phone";

type ActionResult = { success: true } | { success: false; error: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

function toPatientData(data: PatientFormData) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone?.trim() ? normalizePhone(data.phone) : null,
    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
    gender: data.gender || null,
    pronouns: data.pronouns || null,
    backgroundNotes: data.backgroundNotes || null,
  };
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createPatient(data: PatientFormData): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }

  try {
    const workspaceId = await getOrgId();
    await prisma.patient.create({
      data: {
        workspaceId,
        ...toPatientData(parsed.data),
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
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }

  try {
    const workspaceId = await getOrgId();
    // updateMany with workspaceId ensures we never touch another tenant's row
    const result = await prisma.patient.updateMany({
      where: { id, workspaceId },
      data: {
        ...toPatientData(parsed.data),
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
