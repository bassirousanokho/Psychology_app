"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { psychotherapyRate } from "@/lib/rates";
import { appointmentSchema, type AppointmentFormData } from "@/lib/schemas";
import { HOURLY_STEP_MIN, hourlyAmount, isHourly } from "@/lib/session-types";

type ActionResult = { success: true } | { success: false; error: string };

function minutesBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * Overlapping psychotherapy session, if any. Only therapy sessions block each
 * other: hourly work (admin, writing) may overlap anything.
 */
async function findConflict(workspaceId: string, start: Date, end: Date, excludeId?: string) {
  return prisma.appointment.findFirst({
    where: {
      workspaceId,
      id: excludeId ? { not: excludeId } : undefined,
      type: "PSYCHOTHERAPY",
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
}

function overlapError(conflict: { patient: { firstName: string; lastName: string } }) {
  return `Overlaps with ${conflict.patient.firstName} ${conflict.patient.lastName}'s session`;
}

function revalidateAppointment(id: string) {
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/appointments/${id}`);
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createAppointment(data: AppointmentFormData): Promise<ActionResult> {
  const parsed = appointmentSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const { patientId, startTime, endTime, type } = parsed.data;

  // Verify patient exists in this workspace — never trust the client-supplied ID alone
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found in this workspace" };

  const start = new Date(startTime);
  const end = new Date(endTime);
  const minutes = minutesBetween(start, end);

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: userId },
    select: { taxRate: true, hourlyRateAdmin: true, hourlyRateWriting: true },
  });

  let pricing: { tariffAmount: number | Awaited<ReturnType<typeof psychotherapyRate>>; hourlyRate?: number };
  if (isHourly(type)) {
    if (minutes % HOURLY_STEP_MIN !== 0) {
      return { success: false, error: "Time spent must be in half-hour steps" };
    }
    const rate = Number(type === "ADMIN" ? workspace.hourlyRateAdmin : workspace.hourlyRateWriting);
    pricing = { tariffAmount: hourlyAmount(rate, minutes), hourlyRate: rate };
  } else {
    // Refuse double bookings (cancelled / no-show sessions free their slot)
    const conflict = await findConflict(userId, start, end);
    if (conflict) return { success: false, error: overlapError(conflict) };
    // The patient's rate on the session date (individual rate or scheduled change)
    pricing = { tariffAmount: await psychotherapyRate(patientId, start) };
  }

  try {
    await prisma.appointment.create({
      data: {
        workspaceId: userId,
        patientId,
        practitionerId: userId,
        type,
        startTime: start,
        endTime: end,
        ...pricing,
        taxRate: workspace.taxRate,
      },
    });
    revalidatePath("/dashboard/calendar");
    return { success: true };
  } catch (err) {
    console.error("[createAppointment]", err);
    return { success: false, error: "Failed to create appointment" };
  }
}

// ── Status (cancel, no-show, restore) ────────────────────────────────────────

/**
 * Cancel (optionally with a fee: the practitioner decides whether the
 * cancellation is late), mark no-show, or put back to scheduled. Completed
 * sessions are changed from the session page (Reopen), never from here.
 */
export async function updateAppointmentStatus(
  id: string,
  status: "SCHEDULED" | "CANCELLED" | "NO_SHOW",
  options: { cancellationFee?: number | null } = {},
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const appt = await prisma.appointment.findFirst({
    where: { id, workspaceId: userId },
    select: { status: true, type: true, startTime: true, endTime: true, invoice: { select: { id: true } } },
  });
  if (!appt) return { success: false, error: "Appointment not found" };
  if (appt.status === "COMPLETED") {
    return { success: false, error: "Completed sessions can only be changed from the session page" };
  }
  if (appt.invoice) {
    return { success: false, error: "This session has an invoice and can no longer change status" };
  }
  if (status === "NO_SHOW" && appt.startTime > new Date()) {
    return { success: false, error: "A session can only be marked no-show once it has started" };
  }
  const fee = options.cancellationFee;
  if (status === "CANCELLED" && fee != null && !(Number.isFinite(fee) && fee >= 0)) {
    return { success: false, error: "Enter a valid fee" };
  }
  if (status === "SCHEDULED" && !isHourly(appt.type)) {
    const conflict = await findConflict(userId, appt.startTime, appt.endTime, id);
    if (conflict) {
      return {
        success: false,
        error: `The slot is now taken by ${conflict.patient.firstName} ${conflict.patient.lastName}'s session`,
      };
    }
  }

  try {
    await prisma.appointment.update({
      where: { id },
      data:
        status === "CANCELLED"
          ? { status, cancelledAt: new Date(), cancellationFee: fee && fee > 0 ? fee : null }
          : { status, cancelledAt: null, cancellationFee: null },
    });
    revalidateAppointment(id);
    return { success: true };
  } catch (err) {
    console.error("[updateAppointmentStatus]", err);
    return { success: false, error: "Failed to update appointment" };
  }
}

// ── Reschedule (dialog or drag and drop) ─────────────────────────────────────

/**
 * Move a session to a new time (same patient). Scheduled sessions can move;
 * hourly work can also move (or change length) once done, until invoiced.
 */
export async function rescheduleAppointment(
  id: string,
  startTime: string,
  endTime: string,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { success: false, error: "Invalid time" };
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, workspaceId: userId },
    select: { status: true, type: true, hourlyRate: true, invoice: { select: { id: true } } },
  });
  if (!appt) return { success: false, error: "Appointment not found" };

  const hourly = isHourly(appt.type);
  const movable = appt.status === "SCHEDULED" || (hourly && appt.status === "COMPLETED");
  if (!movable || appt.invoice) {
    return { success: false, error: "Only scheduled sessions (or uninvoiced hourly work) can be moved" };
  }

  let tariffAmount: number | undefined;
  if (hourly) {
    const minutes = minutesBetween(start, end);
    if (minutes % HOURLY_STEP_MIN !== 0) {
      return { success: false, error: "Time spent must be in half-hour steps" };
    }
    tariffAmount = hourlyAmount(Number(appt.hourlyRate ?? 0), minutes);
  } else {
    const conflict = await findConflict(userId, start, end, id);
    if (conflict) return { success: false, error: overlapError(conflict) };
  }

  try {
    await prisma.appointment.update({
      where: { id },
      data: { startTime: start, endTime: end, ...(tariffAmount !== undefined && { tariffAmount }) },
    });
    revalidateAppointment(id);
    return { success: true };
  } catch (err) {
    console.error("[rescheduleAppointment]", err);
    return { success: false, error: "Failed to reschedule" };
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

/** Delete a session booked by mistake: only while it has no notes, invoice or documents. */
export async function deleteAppointment(id: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const appt = await prisma.appointment.findFirst({
    where: { id, workspaceId: userId },
    select: {
      status: true,
      sessionNotes: true,
      invoice: { select: { id: true } },
      _count: { select: { documents: true } },
    },
  });
  if (!appt) return { success: false, error: "Appointment not found" };
  // Notes are stored encrypted: an erased draft is still a non-empty string
  const hasNotes = !!decrypt(appt.sessionNotes)?.trim();
  if (appt.status === "COMPLETED" || hasNotes || appt.invoice || appt._count.documents > 0) {
    return {
      success: false,
      error: "This session has notes, an invoice or documents. Cancel it instead.",
    };
  }

  try {
    await prisma.appointment.delete({ where: { id } });
    revalidateAppointment(id);
    return { success: true };
  } catch (err) {
    console.error("[deleteAppointment]", err);
    return { success: false, error: "Failed to delete appointment" };
  }
}

// ── Availability ─────────────────────────────────────────────────────────────

/**
 * Busy psychotherapy intervals for one day (YYYY-MM-DD, practice time zone),
 * used by the booking dialog to offer only free start times.
 */
export async function getBusyIntervals(
  date: string,
  excludeId?: string,
): Promise<{ start: string; end: string }[]> {
  const { userId } = await auth();
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);

  const appts = await prisma.appointment.findMany({
    where: {
      workspaceId: userId,
      id: excludeId ? { not: excludeId } : undefined,
      type: "PSYCHOTHERAPY",
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });

  return appts.map((a) => ({ start: a.startTime.toISOString(), end: a.endTime.toISOString() }));
}
