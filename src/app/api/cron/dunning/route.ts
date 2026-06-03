import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendInvoiceReminder } from "@/lib/email";

// Vercel calls this route daily via vercel.json cron.
// Guarded by CRON_SECRET to prevent public execution.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // 1. Mark overdue: SENT invoices whose dueDate has passed
  await prisma.invoice.updateMany({
    where: { status: "SENT", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });

  // 2. Send reminders for OVERDUE invoices where reminder not yet sent (or sent > 7 days ago)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const overdue = await prisma.invoice.findMany({
    where: {
      status: "OVERDUE",
      OR: [
        { reminderSentAt: null },
        { reminderSentAt: { lt: sevenDaysAgo } },
      ],
    },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      workspace: { select: { name: true, currency: true } },
    },
  });

  let sent = 0;
  for (const inv of overdue) {
    if (!inv.patient.email) continue;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    await sendInvoiceReminder({
      to: inv.patient.email,
      patientName: `${inv.patient.firstName} ${inv.patient.lastName}`,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: Number(inv.totalAmount).toFixed(2),
      currency: inv.workspace.currency,
      dueDate: inv.dueDate.toLocaleDateString("en-GB"),
      publicUrl: `${appUrl}/invoice/${inv.publicToken}`,
    });

    await prisma.invoice.update({
      where: { id: inv.id },
      data: { reminderSentAt: now },
    });

    sent++;
  }

  return NextResponse.json({ marked: overdue.length, remindersSent: sent });
}
