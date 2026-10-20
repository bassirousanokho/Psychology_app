"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { patientSchema, type PatientFormData } from "@/lib/schemas";
import { normalizePhone } from "@/lib/phone";
import { deleteFile } from "@/lib/gcs";
import { audit } from "@/lib/tenant";

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
    emergencyContactName: data.emergencyContactName || null,
    emergencyContactPhone: data.emergencyContactPhone?.trim() ? normalizePhone(data.emergencyContactPhone) : null,
    emergencyContactRelation: data.emergencyContactRelation || null,
    doctorName: data.doctorName || null,
    doctorPhone: data.doctorPhone?.trim() ? normalizePhone(data.doctorPhone) : null,
    tariff: data.tariff?.trim() ? Number(data.tariff) : null,
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
      where: { id, workspaceId, deletedAt: null },
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

// ── Delete (soft) ────────────────────────────────────────────────────────────
// Moves the patient to "Recently deleted": history, notes and invoices are kept,
// upcoming sessions are cancelled and portal access stops.

export async function deletePatient(id: string): Promise<ActionResult> {
  try {
    const workspaceId = await getOrgId();
    const now = new Date();
    const result = await prisma.patient.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: { deletedAt: now },
    });
    if (result.count === 0) return { success: false, error: "Patient not found" };

    await prisma.$transaction([
      prisma.appointment.updateMany({
        where: { patientId: id, workspaceId, status: "SCHEDULED", startTime: { gt: now } },
        data: { status: "CANCELLED" },
      }),
      prisma.patientInvite.updateMany({
        where: { patientId: id, usedAt: null },
        data: { expiresAt: now },
      }),
    ]);

    audit({ workspaceId, userId: workspaceId, action: "DELETE_PATIENT", resourceType: "Patient", resourceId: id });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (err) {
    console.error("[deletePatient]", err);
    return { success: false, error: "Failed to delete patient" };
  }
}

// ── Restore ──────────────────────────────────────────────────────────────────

export async function restorePatient(id: string): Promise<ActionResult> {
  try {
    const workspaceId = await getOrgId();
    const result = await prisma.patient.updateMany({
      where: { id, workspaceId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (result.count === 0) return { success: false, error: "Patient not found" };
    audit({ workspaceId, userId: workspaceId, action: "RESTORE_PATIENT", resourceType: "Patient", resourceId: id });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (err) {
    console.error("[restorePatient]", err);
    return { success: false, error: "Failed to restore patient" };
  }
}

// ── Delete permanently ───────────────────────────────────────────────────────
// Only from "Recently deleted". Refused while invoices exist: French law requires
// keeping invoices for 10 years. Removes the patient's files from GCS too.

export async function purgePatient(id: string): Promise<ActionResult> {
  try {
    const workspaceId = await getOrgId();
    const patient = await prisma.patient.findFirst({
      where: { id, workspaceId, deletedAt: { not: null } },
      select: {
        _count: { select: { invoices: true } },
        documents: { select: { fileKey: true } },
      },
    });
    if (!patient) return { success: false, error: "Patient not found in Recently deleted" };
    if (patient._count.invoices > 0) {
      return {
        success: false,
        error: "This patient has invoices, which must be kept for 10 years. They can stay in Recently deleted.",
      };
    }

    const failed = (
      await Promise.allSettled(patient.documents.map((d) => deleteFile(d.fileKey)))
    ).filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      return { success: false, error: `Could not delete ${failed} file(s) from storage. Try again.` };
    }

    await prisma.patient.delete({ where: { id } }); // cascades appointments, documents, portal access
    audit({ workspaceId, userId: workspaceId, action: "PURGE_PATIENT", resourceType: "Patient", resourceId: id });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (err) {
    console.error("[purgePatient]", err);
    return { success: false, error: "Failed to delete patient permanently" };
  }
}
