"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/tenant";
import { audit } from "@/lib/tenant";
import { UTApi } from "uploadthing/server";
import { sendPortalInvite } from "@/lib/email";

const utapi = new UTApi();

// ── Save document record after UploadThing upload completes ───────────────────

export async function saveDocument(input: {
  patientId: string;
  appointmentId?: string;
  name: string;
  url: string;
  fileKey: string;
  fileType: string;
  fileSize: number;
}) {
  const { orgId, userId } = await requireAuth();

  // Verify patient belongs to this workspace
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
      url: input.url,
      fileKey: input.fileKey,
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

// ── Delete document (from UploadThing CDN + DB) ───────────────────────────────

export async function deleteDocument(documentId: string) {
  const { orgId, userId } = await requireAuth();

  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId: orgId },
    select: { fileKey: true, patientId: true },
  });
  if (!doc) return { success: false, error: "Document not found" };

  // Delete from UploadThing CDN first
  try {
    await utapi.deleteFiles(doc.fileKey);
  } catch (err) {
    console.error("[deleteDocument] CDN delete failed", err);
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
