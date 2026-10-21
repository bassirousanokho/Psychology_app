"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/tenant";
import { noteLibrary } from "@/lib/note-library";
import { langOf } from "@/lib/format";

type ActionResult = { success: true } | { success: false; error: string };

const templateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Give the template a name").max(80, "Name is too long"),
  body: z.string().trim().min(1, "Write the template text").max(20_000, "Template is too long"),
});

function revalidate() {
  revalidatePath("/dashboard/notes/templates");
  revalidatePath("/dashboard/appointments", "layout");
}

export async function saveNoteTemplate(input: z.infer<typeof templateSchema>): Promise<ActionResult> {
  const { orgId } = await requireAuth();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const { id, name, body } = parsed.data;

  if (id) {
    const result = await prisma.noteTemplate.updateMany({ where: { id, workspaceId: orgId }, data: { name, body } });
    if (result.count === 0) return { success: false, error: "Template not found" };
  } else {
    await prisma.noteTemplate.create({ data: { workspaceId: orgId, name, body } });
  }
  revalidate();
  return { success: true };
}

export async function deleteNoteTemplate(id: string): Promise<ActionResult> {
  const { orgId } = await requireAuth();
  const result = await prisma.noteTemplate.deleteMany({ where: { id, workspaceId: orgId } });
  if (result.count === 0) return { success: false, error: "Template not found" };
  revalidate();
  return { success: true };
}

/** Adds a ready-made structure (SOAP, DAP…) to the practice's templates. */
export async function addLibraryNoteTemplate(key: string): Promise<ActionResult> {
  const { orgId } = await requireAuth();
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: orgId }, select: { language: true } });
  const item = noteLibrary(langOf(ws.language)).find((n) => n.key === key);
  if (!item) return { success: false, error: "Template not found" };
  await prisma.noteTemplate.create({ data: { workspaceId: orgId, name: item.name, body: item.body } });
  revalidate();
  return { success: true };
}
