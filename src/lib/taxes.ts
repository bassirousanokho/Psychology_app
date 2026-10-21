// Shared by server and client code.

export type TaxLine = { label: string; rate: number; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Québec invoices show GST (TPS) and QST (TVQ) separately. The session keeps the
 * combined rate it was booked with; it's split using the practice's current
 * GST/QST proportion. Returns null when a single tax line applies (France, no
 * tax, or no GST/QST rates configured).
 */
export function taxLinesFor(
  amount: number,
  combinedRate: number,
  region: string,
  gstRate: number,
  qstRate: number,
): TaxLine[] | null {
  if (region !== "CA-QC" || combinedRate <= 0 || gstRate + qstRate <= 0) return null;
  const gst = (combinedRate * gstRate) / (gstRate + qstRate);
  const qst = combinedRate - gst;
  const lines: TaxLine[] = [];
  if (gst > 0) lines.push({ label: "TPS", rate: round3(gst), amount: round2((amount * gst) / 100) });
  if (qst > 0) lines.push({ label: "TVQ", rate: round3(qst), amount: round2((amount * qst) / 100) });
  return lines;
}
