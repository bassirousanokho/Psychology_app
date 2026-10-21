"use server";

import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { cleanAnswers, linkExpired, parseFields, type Answers } from "@/lib/forms";

/**
 * Saves a patient's answers (opened from the private link, without signing in).
 * With a signature, the typed name, time, IP address and browser are recorded.
 */
export async function submitForm(
  token: string,
  raw: Answers,
  signatureName: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const request = await prisma.formRequest.findUnique({
    where: { token },
    select: { id: true, status: true, fields: true, requiresSignature: true, createdAt: true, patient: { select: { deletedAt: true } } },
  });
  if (!request || request.status === "CANCELLED" || request.patient.deletedAt || linkExpired(request.createdAt)) {
    return { success: false, error: "This form is no longer available" };
  }
  if (request.status === "COMPLETED") return { success: false, error: "This form was already filled in" };

  const cleaned = cleanAnswers(parseFields(request.fields), raw ?? {});
  if ("error" in cleaned) return { success: false, error: cleaned.error };

  const name = signatureName?.trim().slice(0, 200) ?? "";
  if (request.requiresSignature && name.length < 2) return { success: false, error: "Type your full name to sign" };

  const h = await headers();
  const now = new Date();
  // Only the first PENDING submission wins (double clicks, two tabs)
  const updated = await prisma.formRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: "COMPLETED",
      completedAt: now,
      answers: encrypt(JSON.stringify(cleaned.answers)),
      ...(request.requiresSignature && {
        signatureName: name,
        signedAt: now,
        signerIp: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || null,
        signerUserAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      }),
    },
  });
  if (updated.count === 0) return { success: false, error: "This form was already filled in" };
  return { success: true };
}
