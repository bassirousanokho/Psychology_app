"use server";

import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePatientAuth } from "@/lib/patient-auth";

const SESSION_DURATION_MIN = 60;

export async function bookAppointment(input: {
  date: string;  // YYYY-MM-DD
  hour: number;  // 0-23 — slot start hour
}): Promise<{ success: false; error: string } | { success: true }> {
  const session = await requirePatientAuth();

  const { workspaceId, patientId, workspace } = session;

  // Build start/end times
  const startTime = new Date(`${input.date}T${String(input.hour).padStart(2, "0")}:00:00`);
  const endTime = new Date(startTime.getTime() + SESSION_DURATION_MIN * 60 * 1000);

  // Validate day is a working day
  const isoDay = startTime.getDay() === 0 ? 7 : startTime.getDay(); // 1=Mon … 7=Sun
  if (!workspace.workingDays.includes(isoDay)) {
    return { success: false, error: "This day is not available" };
  }

  // Validate hour is within working hours
  const [startH] = workspace.workingHoursStart.split(":").map(Number);
  const [endH] = workspace.workingHoursEnd.split(":").map(Number);
  if (input.hour < startH || input.hour + 1 > endH) {
    return { success: false, error: "This time slot is outside working hours" };
  }

  // Check for conflicts
  const conflict = await prisma.appointment.findFirst({
    where: {
      workspaceId,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      OR: [
        { startTime: { lt: endTime }, endTime: { gt: startTime } },
      ],
    },
  });
  if (conflict) return { success: false, error: "This slot is no longer available" };

  // Find the first practitioner in this workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "PRACTITIONER" },
    select: { userId: true },
  });
  if (!member) return { success: false, error: "No practitioner found in this workspace" };

  await prisma.appointment.create({
    data: {
      workspaceId,
      patientId,
      practitionerId: member.userId,
      startTime,
      endTime,
      status: "SCHEDULED",
      tariffAmount: workspace.defaultTariff,
      taxRate: workspace.taxRate,
    },
  });

  redirect("/portal/appointments");
}

/** Returns booked hours (integers) for a given date in the workspace. */
export async function getBookedHours(
  workspaceId: string,
  date: string,
): Promise<number[]> {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);

  const appts = await prisma.appointment.findMany({
    where: {
      workspaceId,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { startTime: true },
  });

  return appts.map((a) => a.startTime.getHours());
}
