"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendCreditNoteEmail, sendInvoiceEmail } from "@/lib/email";
import { formatLongDate, formatMoney, langOf, localeOf } from "@/lib/format";
import { regionConfig } from "@/lib/regions";
import { createInvoiceWithLines, isEditable, sessionLine, updateDraftLines, type DraftLine } from "@/lib/invoices";

type ActionResult = { success: true } | { success: false; error: string };

async function getOrgId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// Invoices show on the billing pages, the overview and the sessions they bill
function revalidateBilling() {
  revalidatePath("/dashboard", "layout");
}

export async function markInvoicePaid(invoiceId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();

  const result = await prisma.invoice.updateMany({
    where: { id: invoiceId, workspaceId, kind: "INVOICE", status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (result.count === 0) return { success: false, error: "Invoice not found" };
  revalidateBilling();
  return { success: true };
}

/**
 * Undo "paid" (clicked by mistake): the invoice goes back to draft, so no
 * automatic overdue reminder is sent until it's sent again.
 */
export async function markInvoiceUnpaid(invoiceId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();

  const result = await prisma.invoice.updateMany({
    where: { id: invoiceId, workspaceId, kind: "INVOICE", status: "PAID" },
    data: { status: "DRAFT", paidAt: null, receiptSentAt: null },
  });
  if (result.count === 0) return { success: false, error: "Invoice not found" };
  revalidateBilling();
  return { success: true };
}

/** Email the invoice (or credit note) to the patient and mark it sent. */
export async function sendInvoice(invoiceId: string): Promise<ActionResult> {
  const workspaceId = await getOrgId();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      creditedInvoice: { select: { invoiceNumber: true } },
      workspace: {
        select: { name: true, practitionerName: true, currency: true, region: true, language: true },
      },
    },
  });
  if (!invoice) return { success: false, error: "Invoice not found" };
  const creditNote = invoice.kind === "CREDIT_NOTE";
  if (!creditNote && invoice.status === "PAID") return { success: false, error: "This invoice is already paid" };
  if (invoice.status === "CANCELLED") return { success: false, error: "This invoice is cancelled" };
  if (!invoice.patient.email) return { success: false, error: "Patient has no email address on file" };

  const ws = invoice.workspace;
  const lang = langOf(ws.language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const common = {
    lang,
    to: invoice.patient.email,
    patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
    practiceName: ws.practitionerName || ws.name,
    publicUrl: `${appUrl}/invoice/${invoice.publicToken}`,
  };
  try {
    const status = creditNote
      ? await sendCreditNoteEmail({
          ...common,
          number: invoice.invoiceNumber,
          title: regionConfig(ws.region).creditNoteTitle,
          cancelledNumber: invoice.creditedInvoice?.invoiceNumber ?? "",
        })
      : await sendInvoiceEmail({
          ...common,
          invoiceNumber: invoice.invoiceNumber,
          total: formatMoney(Number(invoice.totalAmount), ws.currency, localeOf(lang, ws.region)),
          dueDate: formatLongDate(invoice.dueDate, lang, ws.region),
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
    data: creditNote
      ? { sentAt: new Date() }
      : { status: invoice.status === "OVERDUE" ? "OVERDUE" : "SENT", sentAt: new Date() },
  });
  revalidateBilling();
  return { success: true };
}

// ── Invoice editor ───────────────────────────────────────────────────────────

const lineSchema = z.object({
  appointmentId: z.string().min(1).nullable(),
  description: z.string().trim().min(1, "Each line needs a description").max(300, "A description is too long"),
  quantity: z.number().positive("Quantities must be greater than 0").max(10_000),
  unitPrice: z.number().min(0, "Prices must be 0 or greater").max(1_000_000),
  discountPercent: z.number().min(0).max(100, "A discount is at most 100 %"),
  taxRate: z.number().min(0).max(100),
});

const invoiceSchema = z.object({
  invoiceId: z.string().min(1).optional(),
  patientId: z.string().min(1, "Choose a patient"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date"),
  notes: z.string().max(2000, "Notes are too long"),
  lines: z.array(lineSchema).min(1, "Add at least one line").max(50, "At most 50 lines"),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

/** Creates a draft invoice, or saves changes to a draft that hasn't been sent or paid. */
export async function saveInvoice(
  input: InvoiceInput,
): Promise<{ success: true; invoiceId: string } | { success: false; error: string }> {
  const workspaceId = await getOrgId();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const { invoiceId, patientId, notes, lines } = parsed.data;
  const dueDate = new Date(`${parsed.data.dueDate}T12:00:00`);

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, workspaceId, ...(invoiceId ? {} : { deletedAt: null }) },
    select: { id: true },
  });
  if (!patient) return { success: false, error: "Patient not found" };

  if (invoiceId) {
    const current = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId, patientId },
      select: { id: true },
    });
    if (!current) return { success: false, error: "Invoice not found" };
    const result = await updateDraftLines({ workspaceId, invoiceId, patientId, lines, dueDate, notes });
    if (!result.success) return result;
    revalidateBilling();
    return { success: true, invoiceId };
  }

  const result = await createInvoiceWithLines({ workspaceId, patientId, lines, dueDate, notes });
  if (result.success) revalidateBilling();
  return result;
}

export type BillableSession = {
  id: string;
  startTime: string; // ISO
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  type: "PSYCHOTHERAPY" | "ADMIN" | "WRITING";
  line: DraftLine;
};

/**
 * A patient's sessions that can go on an invoice: not on another invoice, and not
 * cancelled without a fee. Most recent first, over the last 18 months.
 */
export async function getBillableSessions(patientId: string, invoiceId?: string): Promise<BillableSession[]> {
  const workspaceId = await getOrgId();
  const since = new Date();
  since.setMonth(since.getMonth() - 18);

  const sessions = await prisma.appointment.findMany({
    where: {
      workspaceId,
      patientId,
      startTime: { gte: since },
      OR: [{ invoiceId: null }, ...(invoiceId ? [{ invoiceId }] : [])],
      NOT: { status: "CANCELLED", cancellationFee: null },
    },
    orderBy: { startTime: "desc" },
    take: 200,
  });
  return sessions.map((s) => ({
    id: s.id,
    startTime: s.startTime.toISOString(),
    status: s.status,
    type: s.type,
    line: sessionLine(s),
  }));
}

// ── Cancellation and credit notes ────────────────────────────────────────────

/**
 * Cancels an invoice. A draft never sent or paid is simply withdrawn (its number
 * stays in the sequence, marked cancelled). Otherwise a credit note cancelling
 * it in full is issued, as the law requires instead of editing an issued invoice.
 * Its sessions are freed; with `correct`, a new draft with the same lines is
 * created for them, ready to edit.
 */
export async function cancelInvoice(
  invoiceId: string,
  options: { reason: string; correct: boolean; refunded: boolean },
): Promise<{ success: true; creditNoteId: string | null; correctedId: string | null } | { success: false; error: string }> {
  const workspaceId = await getOrgId();
  const reason = options.reason.trim().slice(0, 500);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId, kind: "INVOICE" },
    include: {
      lines: { orderBy: { position: "asc" } },
      workspace: { select: { region: true } },
    },
  });
  if (!invoice) return { success: false, error: "Invoice not found" };
  if (invoice.status === "CANCELLED") return { success: false, error: "This invoice is already cancelled" };

  const lines: DraftLine[] = invoice.lines.map((l) => ({
    appointmentId: l.appointmentId,
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    discountPercent: Number(l.discountPercent),
    taxRate: Number(l.taxRate),
  }));
  const now = new Date();
  const wasPaid = invoice.status === "PAID" && invoice.paidAt !== null;

  let creditNoteId: string | null = null;
  if (!isEditable(invoice)) {
    const notes = [
      `Annule la facture N° ${invoice.invoiceNumber} du ${formatLongDate(invoice.createdAt, "fr", invoice.workspace.region)}.`,
      reason && `Motif : ${reason}`,
      wasPaid && (options.refunded || !options.correct ? "Montant remboursé." : "Montant reporté sur la facture corrigée."),
    ].filter(Boolean).join("\n");
    const credit = await createInvoiceWithLines({
      workspaceId,
      patientId: invoice.patientId,
      kind: "CREDIT_NOTE",
      prefix: regionConfig(invoice.workspace.region).creditNotePrefix,
      lines: lines.map((l) => ({ ...l, unitPrice: -l.unitPrice })),
      dueDate: now,
      notes,
      // Settled at once. When the invoice was paid, the money goes back (refund
      // or carried over to the corrected invoice): dated today, so income nets out.
      status: "PAID",
      paidAt: wasPaid ? now : null,
      creditedInvoiceId: invoice.id,
    });
    if (!credit.success) {
      return { success: false, error: credit.error === "Failed to create invoice" ? "Failed to create the credit note" : credit.error };
    }
    creditNoteId = credit.invoiceId;
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason || null },
    }),
    prisma.appointment.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } }),
  ]);

  let correctedId: string | null = null;
  if (options.correct) {
    const corrected = await createInvoiceWithLines({
      workspaceId,
      patientId: invoice.patientId,
      lines,
      dueDate: invoice.dueDate,
      notes: `Remplace la facture N° ${invoice.invoiceNumber}.`,
    });
    if (corrected.success) correctedId = corrected.invoiceId;
  }

  revalidateBilling();
  return { success: true, creditNoteId, correctedId };
}
