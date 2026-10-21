"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requirePatientAuth, type PatientSession } from "@/lib/patient-auth";
import { psychotherapyRate } from "@/lib/rates";
import { sendPortalConfirmation, sendPractitionerNotice, type PortalChange } from "@/lib/email";
import { formatMoney, formatWhen, langOf, localeOf } from "@/lib/format";

const SESSION_DURATION_MIN = 60;

/** The practice's practitioner (the workspace owner), for notices and replies. */
async function practitionerOf(workspaceId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "PRACTITIONER" },
    select: { user: { select: { id: true, email: true } } },
  });
  return member?.user ?? null;
}

/**
 * Emails the patient a confirmation and the practitioner a notice. Never throws:
 * the change is saved even if an email can't be sent.
 */
async function notify(
  session: PatientSession,
  change: PortalChange,
  start: Date,
  extra: { previousStart?: Date; fee?: number | null } = {},
) {
  const ws = session.workspace;
  const lang = langOf(ws.language);
  const when = formatWhen(start, lang, ws.region);
  const fee = extra.fee ? formatMoney(extra.fee, ws.currency, localeOf(lang, ws.region)) : null;
  const practitioner = await practitionerOf(session.workspaceId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const day = start.toISOString().slice(0, 10);

  const sends: Promise<unknown>[] = [];
  if (session.patient.email) {
    sends.push(
      sendPortalConfirmation({
        lang,
        to: session.patient.email,
        patientName: `${session.patient.firstName} ${session.patient.lastName}`,
        practiceName: ws.practitionerName || ws.name,
        change,
        when,
        fee,
        address: ws.address,
        replyTo: practitioner?.email,
      }),
    );
  }
  if (practitioner?.email) {
    sends.push(
      sendPractitionerNotice({
        lang,
        to: practitioner.email,
        patientName: `${session.patient.firstName} ${session.patient.lastName}`,
        change,
        when,
        previousWhen: extra.previousStart ? formatWhen(extra.previousStart, lang, ws.region) : undefined,
        fee,
        url: `${appUrl}/dashboard/calendar?view=day&date=${day}`,
      }),
    );
  }
  const results = await Promise.allSettled(sends);
  for (const r of results) if (r.status === "rejected") console.error("[portal notify]", r.reason);
}

/** Validates a requested slot: working day and hours, and free of other therapy sessions. */
async function checkSlot(session: PatientSession, date: string, hour: number, excludeId?: string) {
  const { workspace, workspaceId } = session;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour)) {
    return { error: "This time slot is outside working hours" } as const;
  }
  const startTime = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`);
  const endTime = new Date(startTime.getTime() + SESSION_DURATION_MIN * 60 * 1000);

  // Bookable from tomorrow, like the slots offered
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startTime < tomorrow) return { error: "This slot is no longer available" } as const;

  const isoDay = startTime.getDay() === 0 ? 7 : startTime.getDay(); // 1=Mon … 7=Sun
  if (!workspace.workingDays.includes(isoDay)) return { error: "This day is not available" } as const;

  const [startH] = workspace.workingHoursStart.split(":").map(Number);
  const [endH] = workspace.workingHoursEnd.split(":").map(Number);
  if (hour < startH || hour + 1 > endH) return { error: "This time slot is outside working hours" } as const;

  const conflict = await prisma.appointment.findFirst({
    where: {
      workspaceId,
      id: excludeId ? { not: excludeId } : undefined,
      type: "PSYCHOTHERAPY",
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });
  if (conflict) return { error: "This slot is no longer available" } as const;
  return { startTime, endTime } as const;
}

/**
 * A session the patient may still change from the portal: theirs, a scheduled
 * therapy session in the future, not invoiced, with self-service on.
 */
async function ownChangeableSession(session: PatientSession, id: string) {
  if (!session.workspace.patientSelfServiceEnabled) {
    return { error: "Online changes are turned off: please contact your practitioner" } as const;
  }
  const appt = await prisma.appointment.findFirst({
    where: { id, workspaceId: session.workspaceId, patientId: session.patientId },
    select: { id: true, status: true, type: true, startTime: true, endTime: true, invoiceId: true, tariffAmount: true },
  });
  if (!appt) return { error: "Appointment not found" } as const;
  if (appt.status !== "SCHEDULED" || appt.type !== "PSYCHOTHERAPY" || appt.invoiceId || appt.startTime <= new Date()) {
    return { error: "This session can no longer be changed online" } as const;
  }
  return { appt } as const;
}

/** Within the practice's notice period before the session (a late change). */
function isLate(start: Date, noticeHours: number) {
  return start.getTime() - Date.now() < noticeHours * 3_600_000;
}

export async function bookAppointment(input: {
  date: string; // YYYY-MM-DD
  hour: number; // 0-23 — slot start hour
  rescheduleId?: string;
}): Promise<{ success: false; error: string } | { success: true }> {
  const session = await requirePatientAuth();
  const { workspaceId, patientId, workspace } = session;

  // Moving an existing session
  if (input.rescheduleId) {
    const own = await ownChangeableSession(session, input.rescheduleId);
    if ("error" in own) return { success: false, error: own.error! };
    if (isLate(own.appt.startTime, workspace.cancellationNoticeHours)) {
      return { success: false, error: "Too close to the session to move it online: please contact your practitioner" };
    }
    const slot = await checkSlot(session, input.date, input.hour, own.appt.id);
    if ("error" in slot) return { success: false, error: slot.error! };

    await prisma.appointment.update({
      where: { id: own.appt.id },
      data: { startTime: slot.startTime, endTime: slot.endTime, changedByPatientAt: new Date(), reminderSentAt: null },
    });
    await notify(session, "moved", slot.startTime, { previousStart: own.appt.startTime });
    revalidatePath("/dashboard/calendar");
    redirect("/portal/appointments");
  }

  const slot = await checkSlot(session, input.date, input.hour);
  if ("error" in slot) return { success: false, error: slot.error! };

  const practitioner = await practitionerOf(workspaceId);
  if (!practitioner) return { success: false, error: "No practitioner found in this workspace" };

  await prisma.appointment.create({
    data: {
      workspaceId,
      patientId,
      practitionerId: practitioner.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: "SCHEDULED",
      tariffAmount: await psychotherapyRate(patientId, slot.startTime),
      taxRate: workspace.taxRate,
    },
  });
  await notify(session, "booked", slot.startTime);
  revalidatePath("/dashboard/calendar");
  redirect("/portal/appointments");
}

/**
 * Cancels one of the patient's sessions. Within the notice period the session
 * price is recorded as a cancellation fee (the practitioner can change it).
 */
export async function cancelMyAppointment(
  id: string,
): Promise<{ success: true; fee: number | null } | { success: false; error: string }> {
  const session = await requirePatientAuth();
  const own = await ownChangeableSession(session, id);
  if ("error" in own) return { success: false, error: own.error! };

  const late = isLate(own.appt.startTime, session.workspace.cancellationNoticeHours);
  const fee = late && Number(own.appt.tariffAmount) > 0 ? Number(own.appt.tariffAmount) : null;
  // Only if it's still scheduled (the practitioner may have changed it meanwhile)
  const updated = await prisma.appointment.updateMany({
    where: { id, status: "SCHEDULED", invoiceId: null },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancellationFee: fee, changedByPatientAt: new Date() },
  });
  if (updated.count === 0) return { success: false, error: "This session can no longer be changed online" };

  await notify(session, "cancelled", own.appt.startTime, { fee });
  revalidatePath("/portal/appointments");
  revalidatePath("/portal/dashboard");
  revalidatePath("/dashboard/calendar");
  return { success: true, fee };
}

/**
 * Busy therapy-session ranges for a date, as [startMinute, endMinute] from local
 * midnight, so a slot is taken whenever any session overlaps it (not only when a
 * session starts in that hour). The session being moved doesn't count.
 */
export async function getBusyRanges(
  workspaceId: string,
  date: string,
  excludeId?: string,
): Promise<[number, number][]> {
  // Only the practice's own patients may read its schedule
  const session = await requirePatientAuth();
  if (session.workspaceId !== workspaceId) return [];

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);

  const appts = await prisma.appointment.findMany({
    where: {
      workspaceId,
      id: excludeId ? { not: excludeId } : undefined,
      type: "PSYCHOTHERAPY",
      status: { in: ["SCHEDULED", "COMPLETED"] },
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { startTime: true, endTime: true },
  });

  const minutes = (d: Date) => Math.round((d.getTime() - dayStart.getTime()) / 60000);
  return appts.map((a) => [Math.max(0, minutes(a.startTime)), Math.min(24 * 60, minutes(a.endTime))]);
}
