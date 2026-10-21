"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { sendReceiptEmail, type SendStatus } from "@/lib/email";
import { formatLongDate, formatMoney, langOf, localeOf } from "@/lib/format";
import { createInvoiceWithLines, sessionLine } from "@/lib/invoices";

type ActionResult = { success: true } | { success: false; error: string };

async function getOrgId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

function revalidateBilling(appointmentId: string) {
  revalidatePath(`/dashboard/appointments/${appointmentId}`);
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
}

/**
 * Creates the invoice for a completed session, or for a cancellation charged
 * with a fee. Payment is due on the session date (paid at the session).
 * Returns the existing invoice id if there already is one.
 */
async function createInvoice(
  workspaceId: string,
  appointmentId: string,
): Promise<{ success: true; invoiceId: string } | { success: false; error: string }> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, workspaceId },
  });
  if (!appointment) return { success: false, error: "Appointment not found" };
  if (appointment.invoiceId) return { success: true, invoiceId: appointment.invoiceId };

  const fee = appointment.cancellationFee;
  const charged = (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") && fee !== null && fee.gt(0);
  if (appointment.status !== "COMPLETED" && !charged) {
    return { success: false, error: "Only completed sessions, or cancellations and no-shows with a fee, can be invoiced" };
  }

  const result = await createInvoiceWithLines({
    workspaceId,
    patientId: appointment.patientId,
    lines: [sessionLine(appointment)],
    dueDate: appointment.startTime,
  });
  if (!result.success && result.error === "A session on this invoice is already invoiced") {
    // Created meanwhile (double click): use that one
    const existing = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { invoiceId: true } });
    if (existing?.invoiceId) return { success: true, invoiceId: existing.invoiceId };
  }
  return result;
}

export async function generateInvoice(appointmentId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();
  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, workspaceId },
    select: { invoiceId: true },
  });
  if (existing?.invoiceId) return { success: false, error: "Invoice already exists" };

  const result = await createInvoice(workspaceId, appointmentId);
  if (!result.success) return result;
  revalidateBilling(appointmentId);
  return { success: true };
}

/** Record payment for a session: creates the invoice if needed, without sending anything. */
export async function markAppointmentPaid(appointmentId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();
  const result = await createInvoice(workspaceId, appointmentId);
  if (!result.success) return result;

  await prisma.invoice.updateMany({
    where: { id: result.invoiceId, workspaceId, kind: "INVOICE", status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidateBilling(appointmentId);
  return { success: true };
}

/** Email the receipt (quittance) for a paid invoice. */
export async function sendReceipt(invoiceId: string): Promise<ActionResult> {
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
  if (invoice.kind !== "INVOICE" || invoice.status !== "PAID" || !invoice.paidAt) {
    return { success: false, error: "A receipt can only be sent for a paid invoice" };
  }
  if (!invoice.patient.email) return { success: false, error: "Patient has no email address on file" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ws = invoice.workspace;
  const lang = langOf(ws.language);
  let status: SendStatus;
  try {
    status = await sendReceiptEmail({
      lang,
      to: invoice.patient.email,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      practiceName: ws.practitionerName || ws.name,
      invoiceNumber: invoice.invoiceNumber,
      total: formatMoney(Number(invoice.totalAmount), ws.currency, localeOf(lang, ws.region)),
      paidOn: formatLongDate(invoice.paidAt, lang, ws.region),
      publicUrl: `${appUrl}/invoice/${invoice.publicToken}`,
    });
  } catch (err) {
    console.error("[sendReceipt]", err);
    return { success: false, error: "The email could not be sent" };
  }
  if (status === "NOT_CONFIGURED") {
    return { success: false, error: "No email provider is configured: the receipt was not sent" };
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { receiptSentAt: new Date() } });
  revalidatePath("/dashboard/billing", "layout");
  revalidatePath("/dashboard/appointments", "layout");
  return { success: true };
}
