import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import prisma from "@/lib/prisma";
import { langOf } from "@/lib/format";
import { SESSION_TYPE_INVOICE_LABELS } from "@/lib/session-types";

/**
 * Accounting export for one year:
 * - kind=invoices: every invoice issued that year
 * - kind=monthly: invoiced (by issue date) and collected (by payment date) per month
 * French practices get semicolon-separated values with decimal commas (what
 * French-language Excel expects); English ones get commas and decimal points.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const kind = url.searchParams.get("kind") === "monthly" ? "monthly" : "invoices";
  const from = new Date(`${year}-01-01T00:00:00`);
  const to = new Date(`${year + 1}-01-01T00:00:00`);

  const ws = await prisma.workspace.findUnique({ where: { id: userId }, select: { language: true, currency: true } });
  const fr = langOf(ws?.language) === "fr";
  const sep = fr ? ";" : ",";
  const num = (n: number) => (fr ? n.toFixed(2).replace(".", ",") : n.toFixed(2));
  const cell = (v: string) => (/[";,\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const line = (cells: string[]) => cells.map(cell).join(sep);

  let rows: string[];
  if (kind === "invoices") {
    const invoices = await prisma.invoice.findMany({
      where: { workspaceId: userId, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        appointment: { select: { startTime: true, type: true, status: true } },
      },
    });
    rows = [
      line(
        fr
          ? ["N° facture", "Date d'émission", "Date de la séance", "Patient", "Désignation", "Montant", "Taxes", "Total", "Devise", "Statut", "Date de paiement"]
          : ["Invoice", "Issue date", "Session date", "Patient", "Description", "Amount", "Tax", "Total", "Currency", "Status", "Paid on"],
      ),
      ...invoices.map((inv) =>
        line([
          inv.invoiceNumber,
          format(inv.createdAt, "yyyy-MM-dd"),
          inv.appointment ? format(inv.appointment.startTime, "yyyy-MM-dd") : "",
          `${inv.patient.lastName}, ${inv.patient.firstName}`,
          inv.appointment?.status === "CANCELLED"
            ? fr ? "Frais d'annulation" : "Cancellation fee"
            : SESSION_TYPE_INVOICE_LABELS[inv.appointment?.type ?? "PSYCHOTHERAPY"],
          num(Number(inv.amount)),
          num(Number(inv.taxAmount)),
          num(Number(inv.totalAmount)),
          ws?.currency ?? "",
          inv.status,
          inv.paidAt ? format(inv.paidAt, "yyyy-MM-dd") : "",
        ]),
      ),
    ];
  } else {
    const [issued, paid] = await Promise.all([
      prisma.invoice.findMany({
        where: { workspaceId: userId, createdAt: { gte: from, lt: to } },
        select: { createdAt: true, totalAmount: true },
      }),
      prisma.invoice.findMany({
        where: { workspaceId: userId, status: "PAID", paidAt: { gte: from, lt: to } },
        select: { paidAt: true, amount: true, taxAmount: true, totalAmount: true },
      }),
    ]);
    const months = Array.from({ length: 12 }, () => ({ invoiced: 0, count: 0, collected: 0, tax: 0, paidCount: 0 }));
    for (const i of issued) {
      const m = months[i.createdAt.getMonth()];
      m.invoiced += Number(i.totalAmount);
      m.count++;
    }
    for (const p of paid) {
      const m = months[p.paidAt!.getMonth()];
      m.collected += Number(p.totalAmount);
      m.tax += Number(p.taxAmount);
      m.paidCount++;
    }
    const total = months.reduce(
      (t, m) => ({ invoiced: t.invoiced + m.invoiced, count: t.count + m.count, collected: t.collected + m.collected, tax: t.tax + m.tax, paidCount: t.paidCount + m.paidCount }),
      { invoiced: 0, count: 0, collected: 0, tax: 0, paidCount: 0 },
    );
    const row = (label: string, m: typeof total) =>
      line([label, String(m.count), num(m.invoiced), String(m.paidCount), num(m.collected), num(m.tax)]);
    rows = [
      line(
        fr
          ? ["Mois", "Factures émises", "Montant facturé", "Factures payées", "Montant encaissé", "Dont taxes"]
          : ["Month", "Invoices issued", "Amount invoiced", "Invoices paid", "Amount collected", "Of which tax"],
      ),
      ...months.map((m, i) => row(`${year}-${String(i + 1).padStart(2, "0")}`, m)),
      row(fr ? "Total" : "Total", total),
    ];
  }

  // BOM so Excel opens accents correctly
  const csv = "﻿" + rows.join("\r\n") + "\r\n";
  const filename = `${kind === "monthly" ? (fr ? "revenus-mensuels" : "monthly-income") : (fr ? "factures" : "invoices")}-${year}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
