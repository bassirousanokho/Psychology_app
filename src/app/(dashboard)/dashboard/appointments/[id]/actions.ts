"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/tenant";
import { audit } from "@/lib/tenant";
import { encrypt } from "@/lib/crypto";

type ActionResult = { success: true } | { success: false; error: string };

// ── Save draft (auto-save, no status change) ──────────────────────────────────

export async function saveDraftNotes(
  appointmentId: string,
  sessionNotes: string,
): Promise<ActionResult> {
  try {
    const { orgId } = await requireAuth();
    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, workspaceId: orgId },
      data: { sessionNotes: encrypt(sessionNotes) },
    });
    if (result.count === 0) return { success: false, error: "Appointment not found" };
    revalidatePath(`/dashboard/appointments/${appointmentId}`);
    return { success: true };
  } catch (err) {
    console.error("[saveDraftNotes]", err);
    return { success: false, error: "Failed to save draft" };
  }
}

// ── Mark session as completed ─────────────────────────────────────────────────

export async function completeSession(
  appointmentId: string,
  sessionNotes: string,
): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireAuth();
    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, workspaceId: orgId },
      data: {
        sessionNotes: encrypt(sessionNotes),
        noteCompletedAt: new Date(),
        status: "COMPLETED",
      },
    });
    if (result.count === 0) return { success: false, error: "Appointment not found" };

    audit({
      workspaceId: orgId,
      userId,
      action: "COMPLETE_SESSION",
      resourceType: "Appointment",
      resourceId: appointmentId,
    });

    revalidatePath(`/dashboard/appointments/${appointmentId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/notes");
    return { success: true };
  } catch (err) {
    console.error("[completeSession]", err);
    return { success: false, error: "Failed to mark session as complete" };
  }
}

// ── Reopen a completed session ────────────────────────────────────────────────

export async function reopenSession(appointmentId: string): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireAuth();
    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, workspaceId: orgId },
      data: { noteCompletedAt: null, status: "SCHEDULED" },
    });
    if (result.count === 0) return { success: false, error: "Appointment not found" };

    audit({
      workspaceId: orgId,
      userId,
      action: "REOPEN_SESSION",
      resourceType: "Appointment",
      resourceId: appointmentId,
    });

    revalidatePath(`/dashboard/appointments/${appointmentId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("[reopenSession]", err);
    return { success: false, error: "Failed to reopen session" };
  }
}
