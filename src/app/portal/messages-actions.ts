"use server";

import { revalidatePath } from "next/cache";
import { getUploadUrl } from "@/lib/gcs";
import { requirePatientAuth } from "@/lib/patient-auth";
import { checkUpload, sendFromPatient, uploadKey, type AttachmentInput } from "@/lib/inbox";

export async function requestPortalUpload(file: { fileName: string; fileType: string; fileSize: number }) {
  const session = await requirePatientAuth();
  const bad = checkUpload(file.fileType, file.fileSize);
  if (bad) return { success: false as const, error: bad };
  const key = uploadKey(session.workspaceId, session.patientId, file.fileName);
  return { success: true as const, uploadUrl: await getUploadUrl(key, file.fileType), key };
}

export async function sendPortalMessage(body: string, attachments: AttachmentInput[]) {
  const session = await requirePatientAuth();
  const result = await sendFromPatient({ workspaceId: session.workspaceId, patientId: session.patientId, body, attachments });
  if (result.success) {
    revalidatePath("/portal/messages");
    revalidatePath("/dashboard/inbox", "layout");
  }
  return result;
}
