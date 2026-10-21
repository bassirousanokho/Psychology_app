"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/tenant";
import { audit } from "@/lib/tenant";
import { getUploadUrl, deleteFile } from "@/lib/gcs";
import { sendPortalInvite, sendStatementEmail } from "@/lib/email";
import { formatLongDate, langOf } from "@/lib/format";

const MAX_PDF_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// ── Request a signed URL to upload a document straight to GCS ─────────────────

export async function createUploadUrl(input: {
  patientId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}) {
  const { orgId } = await requireAuth();

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, workspaceId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found" };

  const isPdf = input.fileType === "application/pdf";
  const isImage = input.fileType.startsWith("image/");
  if (!isPdf && !isImage) return { success: false, error: "Unsupported file type" };
  if (isPdf && input.fileSize > MAX_PDF_BYTES) return { success: false, error: "PDF exceeds 16 MB limit" };
  if (isImage && input.fileSize > MAX_IMAGE_BYTES) return { success: false, error: "Image exceeds 8 MB limit" };

  const key = `documents/${orgId}/${input.patientId}/${randomUUID()}-${input.fileName}`;
  const uploadUrl = await getUploadUrl(key, input.fileType);

  return { success: true, uploadUrl, key };
}

// ── Save document record after the client finishes uploading to GCS ───────────

export async function confirmDocumentUpload(input: {
  patientId: string;
  appointmentId?: string;
  isSessionNote?: boolean;
  key: string;
  name: string;
  fileType: string;
  fileSize: number;
}) {
  const { orgId, userId } = await requireAuth();

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, workspaceId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found" };

  if (input.appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, workspaceId: orgId, patientId: input.patientId },
      select: { id: true },
    });
    if (!appt) return { success: false, error: "Session not found" };
  }
  // The object key must be one we issued for this workspace and patient
  if (!input.key.startsWith(`documents/${orgId}/${input.patientId}/`)) {
    return { success: false, error: "Invalid upload" };
  }

  const doc = await prisma.document.create({
    data: {
      workspaceId: orgId,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      isSessionNote: input.isSessionNote ?? false,
      uploadedById: userId,
      name: input.name,
      fileKey: input.key,
      fileType: input.fileType,
      fileSize: input.fileSize,
    },
  });

  audit({
    workspaceId: orgId,
    userId,
    action: "UPLOAD_DOCUMENT",
    resourceType: "Document",
    resourceId: doc.id,
    metadata: { patientId: input.patientId, name: input.name },
  });

  revalidatePath(`/dashboard/patients/${input.patientId}`);
  if (input.appointmentId) revalidatePath(`/dashboard/appointments/${input.appointmentId}`);
  return { success: true, documentId: doc.id };
}

// ── Toggle "share with patient" ───────────────────────────────────────────────

export async function toggleShareDocument(documentId: string, shared: boolean) {
  const { orgId } = await requireAuth();

  // Uploaded session notes stay private to the practitioner
  const result = await prisma.document.updateMany({
    where: { id: documentId, workspaceId: orgId, isSessionNote: false },
    data: { sharedWithPatient: shared },
  });

  if (result.count === 0) return { success: false, error: "Document not found" };

  revalidatePath(`/dashboard/patients`);
  return { success: true };
}

// ── Delete document (from GCS + DB) ────────────────────────────────────────────

export async function deleteDocument(documentId: string) {
  const { orgId, userId } = await requireAuth();

  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId: orgId },
    select: { fileKey: true, patientId: true, appointmentId: true },
  });
  if (!doc) return { success: false, error: "Document not found" };

  // Delete from GCS first
  try {
    await deleteFile(doc.fileKey);
  } catch (err) {
    console.error("[deleteDocument] GCS delete failed", err);
  }

  await prisma.document.delete({ where: { id: documentId } });

  audit({
    workspaceId: orgId,
    userId,
    action: "DELETE_DOCUMENT",
    resourceType: "Document",
    resourceId: documentId,
  });

  revalidatePath(`/dashboard/patients/${doc.patientId}`);
  if (doc.appointmentId) revalidatePath(`/dashboard/appointments/${doc.appointmentId}`);
  return { success: true };
}

// ── Send portal invite ────────────────────────────────────────────────────────

export async function sendPortalInviteAction(patientId: string) {
  const { orgId, userId } = await requireAuth();

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId: orgId, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      portalUser: true,
      workspace: { select: { language: true } },
    },
  });
  if (!patient) return { success: false, error: "Patient not found" };
  if (!patient.email) return { success: false, error: "Patient has no email address on file" };
  if (patient.portalUser) return { success: false, error: "Patient already has portal access" };

  // Get practitioner name for the email
  const practitioner = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  // Expire any previous pending invites
  await prisma.patientInvite.updateMany({
    where: { patientId, usedAt: null },
    data: { expiresAt: new Date() },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invite = await prisma.patientInvite.create({
    data: { workspaceId: orgId, patientId, expiresAt },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/portal/join/${invite.token}`;

  const lang = langOf(patient.workspace.language);
  await sendPortalInvite({
    lang,
    to: patient.email,
    patientName: `${patient.firstName} ${patient.lastName}`,
    practitionerName: practitioner?.name ?? (lang === "fr" ? "Votre psychologue" : "Your practitioner"),
    inviteUrl,
    expiresInDays: 7,
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

// ── Statement of payments (for insurance) ────────────────────────────────────

/**
 * Creates a statement for a period; optionally emails the patient a link to it.
 * Returns the public URL path so the practitioner can open or print it.
 */
export async function createStatement(input: {
  patientId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  send: boolean;
}): Promise<{ success: true; path: string; emailed: boolean } | { success: false; error: string }> {
  const { orgId } = await requireAuth();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(input.periodStart) || !dateRe.test(input.periodEnd) || input.periodEnd < input.periodStart) {
    return { success: false, error: "Pick a valid period" };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, workspaceId: orgId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      workspace: { select: { name: true, practitionerName: true, region: true, language: true } },
    },
  });
  if (!patient) return { success: false, error: "Patient not found" };
  if (input.send && !patient.email) return { success: false, error: "Patient has no email address on file" };

  const statement = await prisma.statement.create({
    data: {
      workspaceId: orgId,
      patientId: input.patientId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
    },
  });
  const path = `/statement/${statement.publicToken}`;

  if (!input.send) return { success: true, path, emailed: false };

  const ws = patient.workspace;
  const lang = langOf(ws.language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const status = await sendStatementEmail({
      lang,
      to: patient.email!,
      patientName: `${patient.firstName} ${patient.lastName}`,
      practiceName: ws.practitionerName || ws.name,
      period: `${formatLongDate(new Date(`${input.periodStart}T12:00:00`), lang, ws.region)} – ${formatLongDate(new Date(`${input.periodEnd}T12:00:00`), lang, ws.region)}`,
      publicUrl: `${appUrl}${path}`,
    });
    if (status === "NOT_CONFIGURED") {
      return { success: false, error: "No email provider is configured: the statement was created but not sent" };
    }
  } catch (err) {
    console.error("[createStatement]", err);
    return { success: false, error: "The email could not be sent" };
  }
  await prisma.statement.update({ where: { id: statement.id }, data: { sentAt: new Date() } });
  return { success: true, path, emailed: true };
}
