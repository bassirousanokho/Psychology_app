"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { appointmentSchema, type AppointmentFormData } from "@/lib/schemas";

type ActionResult = { success: true } | { success: false; error: string };

export async function createAppointment(data: AppointmentFormData): Promise<ActionResult> {
  const parsed = appointmentSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const { patientId, startTime, endTime } = parsed.data;

  // Verify patient exists in this workspace — never trust the client-supplied ID alone
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId: userId },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found in this workspace" };

  // Refuse double bookings (cancelled / no-show sessions free their slot)
  const start = new Date(startTime);
  const end = new Date(endTime);
  const conflict = await prisma.appointment.findFirst({
    where: {
      workspaceId: userId,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (conflict) {
    return {
      success: false,
      error: `Overlaps with ${conflict.patient.firstName} ${conflict.patient.lastName}'s session`,
    };
  }

  // Snapshot the workspace tariff at booking time
  const workspace = await prisma.workspace.findUnique({
    where: { id: userId },
    select: { defaultTariff: true, taxRate: true },
  });

  try {
    await prisma.appointment.create({
      data: {
        workspaceId: userId,
        patientId,
        practitionerId: userId,
        startTime: start,
        endTime: end,
        tariffAmount: workspace?.defaultTariff ?? 0,
        taxRate: workspace?.taxRate ?? 0,
      },
    });
    revalidatePath("/dashboard/calendar");
    return { success: true };
  } catch (err) {
    console.error("[createAppointment]", err);
    return { success: false, error: "Failed to create appointment" };
  }
}

export async function updateAppointmentStatus(
  id: string,
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  try {
    const result = await prisma.appointment.updateMany({
      where: { id, workspaceId: userId },
      data: { status },
    });
    if (result.count === 0) return { success: false, error: "Appointment not found" };
    revalidatePath("/dashboard/calendar");
    return { success: true };
  } catch (err) {
    console.error("[updateAppointmentStatus]", err);
    return { success: false, error: "Failed to update appointment" };
  }
}

/**
 * Busy intervals for one day (YYYY-MM-DD, practice time zone), used by the
 * booking dialog to offer only free start times.
 */
export async function getBusyIntervals(
  date: string,
): Promise<{ start: string; end: string }[]> {
  const { userId } = await auth();
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);

  const appts = await prisma.appointment.findMany({
    where: {
      workspaceId: userId,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });

  return appts.map((a) => ({ start: a.startTime.toISOString(), end: a.endTime.toISOString() }));
}
