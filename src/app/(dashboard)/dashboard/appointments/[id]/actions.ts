"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/tenant";
import { audit } from "@/lib/tenant";
import { encrypt } from "@/lib/crypto";
import { isHourly } from "@/lib/session-types";

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
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, workspaceId: orgId },
      select: {
        type: true,
        status: true,
        _count: { select: { documents: { where: { isSessionNote: true } } } },
      },
    });
    if (!appt) return { success: false, error: "Appointment not found" };
    if (appt.status === "CANCELLED") return { success: false, error: "This session was cancelled" };
    // Therapy sessions need typed notes or an uploaded note file; hourly work needs neither
    if (!isHourly(appt.type) && !sessionNotes.trim() && appt._count.documents === 0) {
      return { success: false, error: "Write a few words or upload a note file first" };
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        sessionNotes: encrypt(sessionNotes),
        noteCompletedAt: new Date(),
        status: "COMPLETED",
      },
    });

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
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, workspaceId: orgId },
      select: { invoice: { select: { id: true } } },
    });
    if (!appt) return { success: false, error: "Appointment not found" };

    // Reopening edits the notes only. An invoiced session stays Completed (the
    // session happened and was billed); otherwise it goes back to Scheduled so a
    // session completed by mistake can still be cancelled from the calendar.
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { noteCompletedAt: null, ...(appt.invoice ? {} : { status: "SCHEDULED" }) },
    });

    audit({
      workspaceId: orgId,
      userId,
      action: "REOPEN_SESSION",
      resourceType: "Appointment",
      resourceId: appointmentId,
    });

    revalidatePath(`/dashboard/appointments/${appointmentId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    return { success: true };
  } catch (err) {
    console.error("[reopenSession]", err);
    return { success: false, error: "Failed to reopen session" };
  }
}
