"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { sendReceiptEmail } from "@/lib/email";

type ActionResult = { success: true } | { success: false; error: string };

async function getOrgId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

/**
 * Next number in this workspace's sequence for the current year (INV-2026-0001, …).
 * Based on the highest existing number rather than a count, so it never reuses one.
 */
async function nextInvoiceNumber(workspaceId: string): Promise<string> {
  const prefix = `INV-${new Date().getFullYear()}-`;
  const last = await prisma.invoice.findFirst({
    where: { workspaceId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const seq = last ? Number(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
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
    include: { invoice: { select: { id: true } } },
  });
  if (!appointment) return { success: false, error: "Appointment not found" };
  if (appointment.invoice) return { success: true, invoiceId: appointment.invoice.id };

  const fee = appointment.cancellationFee;
  const chargedCancellation = appointment.status === "CANCELLED" && fee !== null && fee.gt(0);
  if (appointment.status !== "COMPLETED" && !chargedCancellation) {
    return { success: false, error: "Only completed sessions or charged cancellations can be invoiced" };
  }

  const amount = chargedCancellation ? fee : appointment.tariffAmount;
  const taxRate = appointment.taxRate;
  const taxAmount = amount.mul(taxRate).div(100);
  const totalAmount = amount.add(taxAmount);

  // Two invoices generated at the same moment could pick the same number: the
  // (workspaceId, invoiceNumber) unique index rejects one, which then retries.
  for (let attempt = 0; ; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(workspaceId);
    try {
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          patientId: appointment.patientId,
          appointmentId,
          invoiceNumber,
          amount,
          taxAmount,
          taxRate,
          totalAmount,
          status: "DRAFT",
          dueDate: appointment.startTime,
        },
      });
      return { success: true, invoiceId: invoice.id };
    } catch (err) {
      // Unique violation: which constraint is reported differently by driver adapters,
      // so look for the field name anywhere in the error metadata
      const { code, meta } = err as { code?: string; meta?: unknown };
      if (code === "P2002") {
        if (JSON.stringify(meta ?? {}).includes("appointmentId")) {
          const existing = await prisma.invoice.findUnique({ where: { appointmentId }, select: { id: true } });
          if (existing) return { success: true, invoiceId: existing.id };
        }
        if (attempt < 3) continue;
      }
      console.error("[createInvoice]", err);
      return { success: false, error: "Failed to create invoice" };
    }
  }
}

export async function generateInvoice(appointmentId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();
  const existing = await prisma.invoice.findFirst({
    where: { appointmentId, workspaceId },
    select: { id: true },
  });
  if (existing) return { success: false, error: "Invoice already exists" };

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
    where: { id: result.invoiceId, workspaceId, status: { not: "PAID" } },
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
      workspace: { select: { name: true, currency: true } },
    },
  });
  if (!invoice) return { success: false, error: "Invoice not found" };
  if (invoice.status !== "PAID" || !invoice.paidAt) {
    return { success: false, error: "A receipt can only be sent for a paid invoice" };
  }
  if (!invoice.patient.email) return { success: false, error: "Patient has no email address on file" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    await sendReceiptEmail({
      to: invoice.patient.email,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      practiceName: invoice.workspace.name,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: Number(invoice.totalAmount).toFixed(2),
      currency: invoice.workspace.currency,
      paidOn: invoice.paidAt.toLocaleDateString("fr-FR"),
      publicUrl: `${appUrl}/invoice/${invoice.publicToken}`,
    });
  } catch (err) {
    console.error("[sendReceipt]", err);
    return { success: false, error: "The email could not be sent" };
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { receiptSentAt: new Date() } });
  if (invoice.appointmentId) revalidateBilling(invoice.appointmentId);
  else revalidatePath("/dashboard/billing");
  return { success: true };
}
