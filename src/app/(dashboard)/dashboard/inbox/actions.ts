"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getUploadUrl } from "@/lib/gcs";
import { audit, requireAuth } from "@/lib/tenant";
import { checkUpload, sendToPatient, uploadKey, type AttachmentInput, type NoticeResult } from "@/lib/inbox";

type UploadResult = { success: true; uploadUrl: string; key: string } | { success: false; error: string };

/** Signed URL to upload an attachment straight to storage. */
export async function requestUpload(
  patientId: string,
  file: { fileName: string; fileType: string; fileSize: number },
): Promise<UploadResult> {
  const { orgId } = await requireAuth();
  const patient = await prisma.patient.findFirst({ where: { id: patientId, workspaceId: orgId, deletedAt: null }, select: { id: true } });
  if (!patient) return { success: false, error: "Patient not found" };
  const bad = checkUpload(file.fileType, file.fileSize);
  if (bad) return { success: false, error: bad };
  const key = uploadKey(orgId, patientId, file.fileName);
  return { success: true, uploadUrl: await getUploadUrl(key, file.fileType), key };
}

export async function sendMessage(
  patientId: string,
  body: string,
  attachments: AttachmentInput[],
): Promise<{ success: true; notice: NoticeResult; link: string | null } | { success: false; error: string }> {
  const { orgId, userId } = await requireAuth();
  const result = await sendToPatient({ workspaceId: orgId, senderId: userId, patientId, body, attachments });
  if (result.success) {
    audit({ workspaceId: orgId, userId, action: "SEND_MESSAGE", resourceType: "Patient", resourceId: patientId, metadata: { notice: result.notice } });
    revalidatePath("/dashboard/inbox", "layout");
    revalidatePath(`/dashboard/patients/${patientId}`);
  }
  return result;
}

/** New private link: the old one stops working and open sessions are signed out. */
export async function resetInboxLink(patientId: string): Promise<{ success: true } | { success: false; error: string }> {
  const { orgId } = await requireAuth();
  const result = await prisma.patient.updateMany({
    where: { id: patientId, workspaceId: orgId },
    data: { inboxToken: null, inboxFailedAttempts: 0, inboxLockedUntil: null },
  });
  if (result.count === 0) return { success: false, error: "Patient not found" };
  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath("/dashboard/inbox", "layout");
  return { success: true };
}
