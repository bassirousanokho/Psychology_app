"use server";

import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { deleteFile, getUploadUrl } from "@/lib/gcs";

type ActionResult = { success: true } | { success: false; error: string };

const digits = (n: number, label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || v.replace(/\s/g, "").length === n && /^\d+$/.test(v.replace(/\s/g, "")), `${label} must be ${n} digits`);

const invoiceDetailsSchema = z.object({
  practitionerName: z.string().trim().max(120).optional(),
  professionalTitle: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  permitNumber: z.string().trim().max(30).optional(),
  neq: digits(10, "NEQ"),
  gstNumber: z.string().trim().max(30).optional(),
  qstNumber: z.string().trim().max(30).optional(),
  siret: digits(14, "SIRET"),
  adeli: digits(9, "ADELI"),
  rpps: digits(11, "RPPS"),
  vatMention: z.string().trim().max(300).optional(),
  paymentTerms: z.string().trim().max(500).optional(),
  invoiceNotes: z.string().trim().max(1000).optional(),
});

export type InvoiceDetailsData = z.input<typeof invoiceDetailsSchema>;

const empty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const compact = (v: string | undefined) => (v && v.trim() ? v.replace(/\s/g, "") : null);

export async function updateInvoiceDetails(data: InvoiceDetailsData): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  const parsed = invoiceDetailsSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const d = parsed.data;

  await prisma.workspace.update({
    where: { id: userId },
    data: {
      practitionerName: empty(d.practitionerName),
      professionalTitle: empty(d.professionalTitle),
      address: empty(d.address),
      permitNumber: empty(d.permitNumber),
      neq: compact(d.neq),
      gstNumber: empty(d.gstNumber),
      qstNumber: empty(d.qstNumber),
      siret: compact(d.siret),
      adeli: compact(d.adeli),
      rpps: compact(d.rpps),
      vatMention: empty(d.vatMention),
      paymentTerms: empty(d.paymentTerms),
      invoiceNotes: empty(d.invoiceNotes),
    },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/billing");
  return { success: true };
}

// ── Header / footer images ───────────────────────────────────────────────────

type BrandingKind = "header" | "footer";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FIELD = { header: "invoiceHeaderKey", footer: "invoiceFooterKey" } as const;

export async function createBrandingUploadUrl(input: {
  kind: BrandingKind;
  fileType: string;
  fileSize: number;
}): Promise<{ success: true; uploadUrl: string; key: string } | { success: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  if (!(input.kind in FIELD)) return { success: false, error: "Invalid image slot" };
  if (!IMAGE_TYPES.includes(input.fileType)) return { success: false, error: "Use a PNG, JPEG or WebP image" };
  if (input.fileSize > MAX_IMAGE_BYTES) return { success: false, error: "Image exceeds 5 MB" };

  const ext = input.fileType.split("/")[1].replace("jpeg", "jpg");
  const key = `branding/${userId}/${input.kind}-${randomUUID()}.${ext}`;
  return { success: true, uploadUrl: await getUploadUrl(key, input.fileType), key };
}

/** Saves the uploaded image as the invoice header/footer and deletes the previous one. */
export async function confirmBrandingUpload(kind: BrandingKind, key: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  if (!(kind in FIELD) || !key.startsWith(`branding/${userId}/${kind}-`)) {
    return { success: false, error: "Invalid upload" };
  }
  const previous = await prisma.workspace.findUniqueOrThrow({
    where: { id: userId },
    select: { invoiceHeaderKey: true, invoiceFooterKey: true },
  });
  await prisma.workspace.update({ where: { id: userId }, data: { [FIELD[kind]]: key } });
  const old = previous[FIELD[kind]];
  if (old) await deleteFile(old).catch((err) => console.error("[confirmBrandingUpload] delete old", err));
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function removeBranding(kind: BrandingKind): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  if (!(kind in FIELD)) return { success: false, error: "Invalid image slot" };
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: userId },
    select: { invoiceHeaderKey: true, invoiceFooterKey: true },
  });
  const key = ws[FIELD[kind]];
  await prisma.workspace.update({ where: { id: userId }, data: { [FIELD[kind]]: null } });
  if (key) await deleteFile(key).catch((err) => console.error("[removeBranding]", err));
  revalidatePath("/dashboard/settings");
  return { success: true };
}
