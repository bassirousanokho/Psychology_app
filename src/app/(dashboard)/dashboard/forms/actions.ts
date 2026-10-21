"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { audit, requireAuth } from "@/lib/tenant";
import { FIELD_TYPES, FORM_KINDS, validateFields, type FormField } from "@/lib/forms";
import { formLibrary } from "@/lib/form-library";
import { sendFormRequestEmail } from "@/lib/email";
import { langOf } from "@/lib/format";

type ActionResult = { success: true } | { success: false; error: string };

const fieldSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(FIELD_TYPES),
  label: z.string().max(5000),
  help: z.string().max(500).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(30).optional(),
});

const templateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Give the form a name").max(120, "Name is too long"),
  kind: z.enum(FORM_KINDS),
  description: z.string().trim().max(1000, "Description is too long"),
  requiresSignature: z.boolean(),
  fields: z.array(fieldSchema),
});

export type FormTemplateInput = z.infer<typeof templateSchema>;

function revalidate() {
  revalidatePath("/dashboard/forms", "layout");
  revalidatePath("/dashboard/patients", "layout");
}

/** Keeps options only on choice questions, without empty ones. */
function tidy(fields: FormField[]): FormField[] {
  return fields.map((f) => {
    const { options, help, ...rest } = f;
    return {
      ...rest,
      label: f.label.trim(),
      ...(help?.trim() ? { help: help.trim() } : {}),
      ...(f.type === "choice" || f.type === "multichoice" ? { options: (options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
    };
  });
}

export async function saveFormTemplate(
  input: FormTemplateInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { orgId } = await requireAuth();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const fields = tidy(parsed.data.fields);
  const invalid = validateFields(fields);
  if (invalid) return { success: false, error: invalid };

  const data = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    description: parsed.data.description || null,
    requiresSignature: parsed.data.requiresSignature,
    fields: fields as unknown as Prisma.InputJsonValue,
  };
  // Forms already sent keep the version they were sent with (a copy is stored on each request)
  if (parsed.data.id) {
    const result = await prisma.formTemplate.updateMany({ where: { id: parsed.data.id, workspaceId: orgId }, data });
    if (result.count === 0) return { success: false, error: "Form not found" };
    revalidate();
    return { success: true, id: parsed.data.id };
  }
  const created = await prisma.formTemplate.create({ data: { ...data, workspaceId: orgId } });
  revalidate();
  return { success: true, id: created.id };
}

/** Hides a form from the list (requests already sent are kept). */
export async function archiveFormTemplate(id: string, archived: boolean): Promise<ActionResult> {
  const { orgId } = await requireAuth();
  const result = await prisma.formTemplate.updateMany({
    where: { id, workspaceId: orgId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (result.count === 0) return { success: false, error: "Form not found" };
  revalidate();
  return { success: true };
}

/** Adds a ready-made form (intake, consent, check-in) to the practice. */
export async function addLibraryForm(key: string): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { orgId } = await requireAuth();
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: orgId }, select: { language: true, region: true } });
  const item = formLibrary(langOf(ws.language), ws.region).find((f) => f.key === key);
  if (!item) return { success: false, error: "Form not found" };
  const created = await prisma.formTemplate.create({
    data: {
      workspaceId: orgId,
      name: item.name,
      kind: item.kind,
      description: item.description,
      requiresSignature: item.requiresSignature,
      fields: item.fields as unknown as Prisma.InputJsonValue,
    },
  });
  revalidate();
  return { success: true, id: created.id };
}

/**
 * Sends a form to a patient: a copy of the form is stored with a private link,
 * emailed when the patient has an address, and listed in their portal.
 */
export async function sendFormToPatient(
  patientId: string,
  templateId: string,
): Promise<{ success: true; emailed: boolean; path: string } | { success: false; error: string }> {
  const { orgId, userId } = await requireAuth();
  const [patient, template] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, workspaceId: orgId, deletedAt: null },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        workspace: { select: { name: true, practitionerName: true, language: true } },
      },
    }),
    prisma.formTemplate.findFirst({ where: { id: templateId, workspaceId: orgId, archivedAt: null } }),
  ]);
  if (!patient) return { success: false, error: "Patient not found" };
  if (!template) return { success: false, error: "Form not found" };

  const request = await prisma.formRequest.create({
    data: {
      workspaceId: orgId,
      patientId,
      templateId,
      name: template.name,
      kind: template.kind,
      description: template.description,
      fields: template.fields as Prisma.InputJsonValue,
      requiresSignature: template.requiresSignature,
    },
  });
  const path = `/form/${request.token}`;
  audit({ workspaceId: orgId, userId, action: "SEND_FORM", resourceType: "FormRequest", resourceId: request.id, metadata: { patientId } });

  let emailed = false;
  if (patient.email) {
    const practitioner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    try {
      const status = await sendFormRequestEmail({
        lang: langOf(patient.workspace.language),
        to: patient.email,
        patientName: `${patient.firstName} ${patient.lastName}`,
        practiceName: patient.workspace.practitionerName || patient.workspace.name,
        formName: template.name,
        signature: template.requiresSignature,
        url: `${appUrl}${path}`,
        replyTo: practitioner?.email,
      });
      emailed = status === "SENT";
    } catch (err) {
      console.error("[sendFormToPatient]", err);
    }
  }
  if (emailed) await prisma.formRequest.update({ where: { id: request.id }, data: { sentAt: new Date() } });

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true, emailed, path };
}

/** Withdraws a form not yet filled in: its link stops working. */
export async function cancelFormRequest(id: string): Promise<ActionResult> {
  const { orgId } = await requireAuth();
  const request = await prisma.formRequest.findFirst({ where: { id, workspaceId: orgId }, select: { patientId: true, status: true } });
  if (!request) return { success: false, error: "Form not found" };
  if (request.status !== "PENDING") return { success: false, error: "This form was already filled in" };
  await prisma.formRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath(`/dashboard/patients/${request.patientId}`);
  return { success: true };
}
