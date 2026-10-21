// Shared by server and client code: amounts of invoice lines and invoice totals.

import { taxLinesFor, type TaxLine } from "./taxes";

export type LineInput = {
  quantity: number;
  unitPrice: number;
  discountPercent: number; // 0–100
  taxRate: number;         // combined rate, e.g. 14.975
};

export type InvoiceTotals = {
  amount: number;     // sum of the lines before tax
  taxAmount: number;
  taxRate: number;    // the lines' rate when they share one, else 0
  taxLines: TaxLine[] | null;
  totalAmount: number;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** quantity × unit price, less the discount, rounded to the cent. */
export function lineAmount(line: Pick<LineInput, "quantity" | "unitPrice" | "discountPercent">): number {
  return round2(line.quantity * line.unitPrice * (1 - line.discountPercent / 100));
}

/**
 * Totals of an invoice. Each line is taxed at its own rate; in Québec the tax is
 * split into TPS and TVQ lines using the practice's GST/QST proportion.
 */
export function invoiceTotals(
  lines: LineInput[],
  region: string,
  gstRate: number,
  qstRate: number,
): InvoiceTotals {
  let amount = 0;
  let taxAmount = 0;
  const byLabel = new Map<string, TaxLine>();
  let split = true;

  for (const line of lines) {
    const net = lineAmount(line);
    amount += net;
    if (line.taxRate <= 0) continue;
    const parts = taxLinesFor(net, line.taxRate, region, gstRate, qstRate);
    if (!parts) {
      split = false;
      taxAmount += round2((net * line.taxRate) / 100);
      continue;
    }
    for (const p of parts) {
      taxAmount += p.amount;
      const key = `${p.label}-${p.rate}`;
      const prev = byLabel.get(key);
      byLabel.set(key, prev ? { ...prev, amount: round2(prev.amount + p.amount) } : p);
    }
  }

  const rates = [...new Set(lines.filter((l) => l.taxRate > 0).map((l) => l.taxRate))];
  amount = round2(amount);
  taxAmount = round2(taxAmount);
  return {
    amount,
    taxAmount,
    taxRate: rates.length === 1 ? rates[0] : 0,
    taxLines: split && byLabel.size > 0 ? [...byLabel.values()] : null,
    totalAmount: round2(amount + taxAmount),
  };
}
