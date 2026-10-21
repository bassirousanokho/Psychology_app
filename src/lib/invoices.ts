// Server-side invoice helpers: numbering, session lines, creation with lines.

import { differenceInMinutes, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { invoiceTotals, lineAmount, round2, type LineInput } from "@/lib/invoice-math";
import { formatDuration, isHourly, SESSION_TYPE_INVOICE_LABELS, type SessionType } from "@/lib/session-types";

export type DraftLine = LineInput & { description: string; appointmentId: string | null };

type Result<T> = ({ success: true } & T) | { success: false; error: string };

type BillableSession = {
  id: string;
  startTime: Date;
  endTime: Date;
  type: SessionType;
  status: string;
  tariffAmount: Prisma.Decimal | number;
  hourlyRate: Prisma.Decimal | number | null;
  taxRate: Prisma.Decimal | number;
  cancellationFee: Prisma.Decimal | number | null;
};

/** Invoice line billing a session, worded in French like the rest of the invoice. */
export function sessionLine(appt: BillableSession): DraftLine {
  const date = format(appt.startTime, "d MMMM yyyy", { locale: fr });
  const taxRate = Number(appt.taxRate);
  const fee = appt.cancellationFee !== null ? Number(appt.cancellationFee) : 0;
  const base = { appointmentId: appt.id, discountPercent: 0, taxRate };

  if (appt.status === "CANCELLED" && fee > 0) {
    return { ...base, description: `Frais d'annulation — séance du ${date}`, quantity: 1, unitPrice: fee };
  }
  if (appt.status === "NO_SHOW") {
    return { ...base, description: `Absence sans préavis — séance du ${date}`, quantity: 1, unitPrice: Number(appt.tariffAmount) };
  }
  if (isHourly(appt.type)) {
    const minutes = differenceInMinutes(appt.endTime, appt.startTime);
    const description = `${SESSION_TYPE_INVOICE_LABELS[appt.type]} — ${date} (${formatDuration(minutes)})`;
    // Hours × hourly rate when the rate is known (time is in half-hour steps)
    if (appt.hourlyRate !== null && Number(appt.hourlyRate) > 0) {
      return { ...base, description, quantity: round2(minutes / 60), unitPrice: Number(appt.hourlyRate) };
    }
    return { ...base, description, quantity: 1, unitPrice: Number(appt.tariffAmount) };
  }
  return {
    ...base,
    description: `${SESSION_TYPE_INVOICE_LABELS[appt.type]} — ${date}`,
    quantity: 1,
    unitPrice: Number(appt.tariffAmount),
  };
}

/**
 * Next number in this workspace's sequence for the current year (INV-2026-0001,
 * NC-2026-0001 for credit notes…). Based on the highest existing number rather
 * than a count, so it never reuses one.
 */
export async function nextNumber(workspaceId: string, prefix: string): Promise<string> {
  const start = `${prefix}-${new Date().getFullYear()}-`;
  const last = await prisma.invoice.findFirst({
    where: { workspaceId, invoiceNumber: { startsWith: start } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const seq = last ? Number(last.invoiceNumber.slice(start.length)) + 1 : 1;
  return `${start}${String(seq).padStart(4, "0")}`;
}

/** A draft can be edited until it's sent, paid or cancelled; after that, only a credit note corrects it. */
export function isEditable(inv: { kind: string; status: string; sentAt: Date | null }): boolean {
  return inv.kind === "INVOICE" && inv.status === "DRAFT" && inv.sentAt === null;
}

class AlreadyInvoiced extends Error {}

/**
 * Creates an invoice (or credit note) with its lines, numbered in sequence. For
 * an invoice, the sessions on its lines are linked to it; a session already on
 * another invoice is refused.
 */
export async function createInvoiceWithLines(params: {
  workspaceId: string;
  patientId: string;
  kind?: "INVOICE" | "CREDIT_NOTE";
  prefix?: string;
  lines: DraftLine[];
  dueDate: Date;
  notes?: string | null;
  status?: "DRAFT" | "PAID";
  paidAt?: Date | null;
  creditedInvoiceId?: string;
}): Promise<Result<{ invoiceId: string }>> {
  const kind = params.kind ?? "INVOICE";
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: params.workspaceId },
    select: { region: true, gstRate: true, qstRate: true },
  });
  const totals = invoiceTotals(params.lines, ws.region, Number(ws.gstRate), Number(ws.qstRate));
  const sessionIds = kind === "INVOICE" ? linkedSessions(params.lines) : [];

  // Two invoices created at the same moment could pick the same number: the
  // (workspaceId, invoiceNumber) unique index rejects one, which then retries.
  for (let attempt = 0; ; attempt++) {
    const invoiceNumber = await nextNumber(params.workspaceId, params.prefix ?? "INV");
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            workspaceId: params.workspaceId,
            patientId: params.patientId,
            kind,
            invoiceNumber,
            amount: totals.amount,
            taxAmount: totals.taxAmount,
            taxRate: totals.taxRate,
            taxLines: totals.taxLines ?? undefined,
            totalAmount: totals.totalAmount,
            notes: params.notes || null,
            status: params.status ?? "DRAFT",
            paidAt: params.paidAt ?? null,
            dueDate: params.dueDate,
            creditedInvoiceId: params.creditedInvoiceId,
            lines: { create: lineRows(params.lines) },
          },
          select: { id: true },
        });
        if (sessionIds.length > 0) {
          const linked = await tx.appointment.updateMany({
            where: { id: { in: sessionIds }, workspaceId: params.workspaceId, patientId: params.patientId, invoiceId: null },
            data: { invoiceId: created.id },
          });
          if (linked.count !== sessionIds.length) throw new AlreadyInvoiced();
        }
        return created;
      });
      return { success: true, invoiceId: invoice.id };
    } catch (err) {
      if (err instanceof AlreadyInvoiced) {
        return { success: false, error: "A session on this invoice is already invoiced" };
      }
      const { code } = err as { code?: string };
      if (code === "P2002" && attempt < 3) continue;
      console.error("[createInvoiceWithLines]", err);
      return { success: false, error: "Failed to create invoice" };
    }
  }
}

/** Replaces the lines of an editable draft and re-links its sessions. */
export async function updateDraftLines(params: {
  workspaceId: string;
  invoiceId: string;
  patientId: string;
  lines: DraftLine[];
  dueDate: Date;
  notes?: string | null;
}): Promise<Result<object>> {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: params.workspaceId },
    select: { region: true, gstRate: true, qstRate: true },
  });
  const totals = invoiceTotals(params.lines, ws.region, Number(ws.gstRate), Number(ws.qstRate));
  const sessionIds = linkedSessions(params.lines);

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: it may have been sent or paid meanwhile
      const current = await tx.invoice.findFirst({
        where: { id: params.invoiceId, workspaceId: params.workspaceId },
        select: { kind: true, status: true, sentAt: true },
      });
      if (!current || !isEditable(current)) throw new NotEditable();

      await tx.appointment.updateMany({
        where: { invoiceId: params.invoiceId, id: { notIn: sessionIds } },
        data: { invoiceId: null },
      });
      if (sessionIds.length > 0) {
        const linked = await tx.appointment.updateMany({
          where: {
            id: { in: sessionIds },
            workspaceId: params.workspaceId,
            patientId: params.patientId,
            OR: [{ invoiceId: null }, { invoiceId: params.invoiceId }],
          },
          data: { invoiceId: params.invoiceId },
        });
        if (linked.count !== sessionIds.length) throw new AlreadyInvoiced();
      }
      await tx.invoiceLine.deleteMany({ where: { invoiceId: params.invoiceId } });
      await tx.invoice.update({
        where: { id: params.invoiceId },
        data: {
          amount: totals.amount,
          taxAmount: totals.taxAmount,
          taxRate: totals.taxRate,
          taxLines: totals.taxLines ?? Prisma.DbNull,
          totalAmount: totals.totalAmount,
          notes: params.notes || null,
          dueDate: params.dueDate,
          lines: { create: lineRows(params.lines) },
        },
      });
    });
    return { success: true };
  } catch (err) {
    if (err instanceof AlreadyInvoiced) return { success: false, error: "A session on this invoice is already invoiced" };
    if (err instanceof NotEditable) {
      return { success: false, error: "This invoice was sent or paid: correct it with a credit note" };
    }
    console.error("[updateDraftLines]", err);
    return { success: false, error: "Failed to save the invoice" };
  }
}

class NotEditable extends Error {}

function linkedSessions(lines: DraftLine[]): string[] {
  return [...new Set(lines.map((l) => l.appointmentId).filter((id): id is string => !!id))];
}

function lineRows(lines: DraftLine[]) {
  return lines.map((l, position) => ({
    position,
    appointmentId: l.appointmentId,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPercent: l.discountPercent,
    taxRate: l.taxRate,
    amount: lineAmount(l),
  }));
}
