"use server";

import { revalidatePath } from "next/cache";
import { getUploadUrl } from "@/lib/gcs";
import { checkUpload, linkSession, sendFromPatient, uploadKey, verifyInboxLink, type AttachmentInput } from "@/lib/inbox";

const EXPIRED = "Your session has expired: check your details again";

/** Private link: first letters of the last name + date of birth. */
export async function verifyLink(token: string, name: string, dateOfBirth: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return { success: false as const, error: "Enter your date of birth" };
  return verifyInboxLink(token, { name, dateOfBirth });
}

export async function requestLinkUpload(token: string, file: { fileName: string; fileType: string; fileSize: number }) {
  const patient = await linkSession(token);
  if (!patient) return { success: false as const, error: EXPIRED };
  const bad = checkUpload(file.fileType, file.fileSize);
  if (bad) return { success: false as const, error: bad };
  const key = uploadKey(patient.workspaceId, patient.id, file.fileName);
  return { success: true as const, uploadUrl: await getUploadUrl(key, file.fileType), key };
}

export async function sendLinkMessage(token: string, body: string, attachments: AttachmentInput[]) {
  const patient = await linkSession(token);
  if (!patient) return { success: false as const, error: EXPIRED };
  const result = await sendFromPatient({ workspaceId: patient.workspaceId, patientId: patient.id, body, attachments });
  if (result.success) revalidatePath(`/inbox/${token}`);
  return result;
}
