"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { sendInvoiceEmail } from "@/lib/email";
import { formatLongDate, formatMoney, langOf, localeOf } from "@/lib/format";

type ActionResult = { success: true } | { success: false; error: string };

async function getOrgId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

function revalidateInvoice(appointmentId: string | null) {
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
  if (appointmentId) revalidatePath(`/dashboard/appointments/${appointmentId}`);
}

export async function markInvoicePaid(invoiceId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId, status: { not: "PAID" } },
    select: { appointmentId: true },
  });
  if (!invoice) return { success: false, error: "Invoice not found" };

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });
  revalidateInvoice(invoice.appointmentId);
  return { success: true };
}

/**
 * Undo "paid" (clicked by mistake): the invoice goes back to draft, so no
 * automatic overdue reminder is sent until it's sent again.
 */
export async function markInvoiceUnpaid(invoiceId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId, status: "PAID" },
    select: { appointmentId: true },
  });
  if (!invoice) return { success: false, error: "Invoice not found" };

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "DRAFT", paidAt: null, receiptSentAt: null },
  });
  revalidateInvoice(invoice.appointmentId);
  return { success: true };
}

/** Email the invoice to the patient and mark it sent. */
export async function sendInvoice(invoiceId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      workspace: {
        select: { name: true, practitionerName: true, currency: true, region: true, language: true },
      },
    },
  });
  if (!invoice) return { success: false, error: "Invoice not found" };
  if (invoice.status === "PAID") return { success: false, error: "This invoice is already paid" };
  if (!invoice.patient.email) return { success: false, error: "Patient has no email address on file" };

  const ws = invoice.workspace;
  const lang = langOf(ws.language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const status = await sendInvoiceEmail({
      lang,
      to: invoice.patient.email,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      practiceName: ws.practitionerName || ws.name,
      invoiceNumber: invoice.invoiceNumber,
      total: formatMoney(Number(invoice.totalAmount), ws.currency, localeOf(lang, ws.region)),
      dueDate: formatLongDate(invoice.dueDate, lang, ws.region),
      publicUrl: `${appUrl}/invoice/${invoice.publicToken}`,
    });
    if (status === "NOT_CONFIGURED") {
      return { success: false, error: "No email provider is configured: the invoice was not sent" };
    }
  } catch (err) {
    console.error("[sendInvoice]", err);
    return { success: false, error: "The email could not be sent" };
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: invoice.status === "OVERDUE" ? "OVERDUE" : "SENT", sentAt: new Date() },
  });
  revalidateInvoice(invoice.appointmentId);
  return { success: true };
}
