import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendInvoiceReminder } from "@/lib/email";
import { formatLongDate, formatMoney, langOf, localeOf } from "@/lib/format";

// Cloud Scheduler calls this route daily (see README "Deploying to GCP").
// Guarded by CRON_SECRET to prevent public execution.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 1. Mark overdue: SENT invoices whose dueDate has passed
  const marked = await prisma.invoice.updateMany({
    where: { kind: "INVOICE", status: "SENT", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });

  // 2. Send reminders for OVERDUE invoices where reminder not yet sent (or sent > 7 days ago)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const overdue = await prisma.invoice.findMany({
    where: {
      kind: "INVOICE",
      status: "OVERDUE",
      patient: { deletedAt: null },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: sevenDaysAgo } }],
    },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      workspace: { select: { name: true, practitionerName: true, currency: true, region: true, language: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const inv of overdue) {
    if (!inv.patient.email) continue;
    const lang = langOf(inv.workspace.language);
    try {
      const status = await sendInvoiceReminder({
        lang,
        to: inv.patient.email,
        patientName: `${inv.patient.firstName} ${inv.patient.lastName}`,
        practiceName: inv.workspace.practitionerName || inv.workspace.name,
        invoiceNumber: inv.invoiceNumber,
        total: formatMoney(Number(inv.totalAmount), inv.workspace.currency, localeOf(lang, inv.workspace.region)),
        dueDate: formatLongDate(inv.dueDate, lang, inv.workspace.region),
        publicUrl: `${appUrl}/invoice/${inv.publicToken}`,
      });
      // Only count it once an email actually went out
      if (status === "SENT") {
        await prisma.invoice.update({ where: { id: inv.id }, data: { reminderSentAt: now } });
        sent++;
      }
    } catch (err) {
      failed++;
      console.error("[cron/dunning]", inv.id, err);
    }
  }

  return NextResponse.json({ markedOverdue: marked.count, remindersSent: sent, failed });
}
