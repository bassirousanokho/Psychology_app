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
        startTime: new Date(startTime),
        endTime: new Date(endTime),
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
