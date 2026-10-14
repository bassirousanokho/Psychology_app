"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/tenant";
import { audit } from "@/lib/tenant";
import { getUploadUrl, deleteFile } from "@/lib/gcs";
import { sendPortalInvite } from "@/lib/email";

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
    where: { id: input.patientId, workspaceId: orgId },
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
  key: string;
  name: string;
  fileType: string;
  fileSize: number;
}) {
  const { orgId, userId } = await requireAuth();

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, workspaceId: orgId },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found" };

  const doc = await prisma.document.create({
    data: {
      workspaceId: orgId,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
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
  return { success: true, documentId: doc.id };
}

// ── Toggle "share with patient" ───────────────────────────────────────────────

export async function toggleShareDocument(documentId: string, shared: boolean) {
  const { orgId } = await requireAuth();

  const result = await prisma.document.updateMany({
    where: { id: documentId, workspaceId: orgId },
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
    select: { fileKey: true, patientId: true },
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
  return { success: true };
}

// ── Send portal invite ────────────────────────────────────────────────────────

export async function sendPortalInviteAction(patientId: string) {
  const { orgId, userId } = await requireAuth();

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId: orgId },
    select: { id: true, email: true, firstName: true, lastName: true, portalUser: true },
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

  await sendPortalInvite({
    to: patient.email,
    patientName: `${patient.firstName} ${patient.lastName}`,
    practitionerName: practitioner?.name ?? "Your practitioner",
    inviteUrl,
    expiresInDays: 7,
  });

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}
