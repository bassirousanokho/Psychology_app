import { NextResponse } from "next/server";
import { addDays, endOfDay, startOfDay } from "date-fns";
import prisma from "@/lib/prisma";
import { sendSessionReminder } from "@/lib/email";
import { formatWhen, langOf } from "@/lib/format";

/**
 * Day-before session reminders. Cloud Scheduler calls this daily (see README);
 * guarded by CRON_SECRET. Sends one email per scheduled therapy session tomorrow
 * (practice time zone), when reminders are on for the practice and the patient.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const tomorrow = addDays(new Date(), 1);
  const appts = await prisma.appointment.findMany({
    where: {
      type: "PSYCHOTHERAPY",
      status: "SCHEDULED",
      reminderSentAt: null,
      startTime: { gte: startOfDay(tomorrow), lte: endOfDay(tomorrow) },
      workspace: { sessionRemindersEnabled: true },
      patient: { deletedAt: null, remindersEnabled: true, email: { not: null } },
    },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      workspace: {
        select: { id: true, name: true, practitionerName: true, address: true, region: true, language: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // Replies go to the practitioner (workspace id = their user id)
  const practitioners = await prisma.user.findMany({
    where: { id: { in: [...new Set(appts.map((a) => a.workspace.id))] } },
    select: { id: true, email: true },
  });
  const replyTo = new Map(practitioners.map((p) => [p.id, p.email]));

  let sent = 0;
  let failed = 0;
  for (const a of appts) {
    const lang = langOf(a.workspace.language);
    const when = formatWhen(a.startTime, lang, a.workspace.region);
    try {
      const status = await sendSessionReminder({
        lang,
        to: a.patient.email!,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        practiceName: a.workspace.practitionerName || a.workspace.name,
        when,
        address: a.workspace.address,
        replyTo: replyTo.get(a.workspace.id),
      });
      if (status === "SENT") {
        await prisma.appointment.update({ where: { id: a.id }, data: { reminderSentAt: new Date() } });
        sent++;
      }
    } catch (err) {
      failed++;
      console.error("[cron/reminders]", a.id, err);
    }
  }

  return NextResponse.json({ sessionsTomorrow: appts.length, remindersSent: sent, failed });
}
