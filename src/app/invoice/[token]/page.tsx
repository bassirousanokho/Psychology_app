import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr, frCA } from "date-fns/locale";
import { IssuerBlock } from "@/components/billing/issuer-block";
import { regionConfig } from "@/lib/regions";
import type { TaxLine } from "@/lib/taxes";
import { getSignedReadUrl } from "@/lib/gcs";
import prisma from "@/lib/prisma";
import { PrintButton } from "@/components/billing/print-button";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Invoices are issued in French in both regions (France; Québec's Charter of the French language)

export default async function PublicInvoicePage({ params }: PageProps) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true, address: true } },
      workspace: {
        select: {
          name: true,
          currency: true,
          region: true,
          permitNumber: true,
          neq: true,
          gstNumber: true,
          qstNumber: true,
          practitionerName: true,
          professionalTitle: true,
          address: true,
          siret: true,
          adeli: true,
          rpps: true,
          vatMention: true,
          paymentTerms: true,
          invoiceNotes: true,
          invoiceHeaderKey: true,
          invoiceFooterKey: true,
        },
      },
      lines: { orderBy: { position: "asc" } },
      appointments: { select: { startTime: true }, orderBy: { startTime: "asc" } },
      creditedInvoice: { select: { invoiceNumber: true, createdAt: true } },
      creditNote: { select: { invoiceNumber: true, publicToken: true, createdAt: true } },
    },
  });

  if (!invoice) notFound();

  const { patient, workspace: ws } = invoice;
  const creditNote = invoice.kind === "CREDIT_NOTE";
  // Credit note: billed sessions are those of the cancelled invoice, found through the lines
  const sessionDates = invoice.appointments.map((a) => a.startTime);
  const cfg = regionConfig(ws.region);
  const dateLocale = cfg.locale === "fr-CA" ? frCA : fr;
  const d = (date: Date, pattern = "d MMMM yyyy") => format(date, pattern, { locale: dateLocale });
  const money = new Intl.NumberFormat(cfg.locale, { style: "currency", currency: ws.currency });
  const amount = Number(invoice.amount);
  const taxAmount = Number(invoice.taxAmount);
  const totalAmount = Number(invoice.totalAmount);
  const taxRate = Number(invoice.taxRate);
  const isReceipt = !creditNote && invoice.status === "PAID" && invoice.paidAt !== null;
  const cancelled = invoice.status === "CANCELLED";
  const taxLines = Array.isArray(invoice.taxLines) ? (invoice.taxLines as unknown as TaxLine[]) : null;

  const [headerUrl, footerUrl] = await Promise.all([
    ws.invoiceHeaderKey ? getSignedReadUrl(ws.invoiceHeaderKey) : null,
    ws.invoiceFooterKey ? getSignedReadUrl(ws.invoiceFooterKey) : null,
  ]);

  const lines = invoice.lines.map((l) => ({
    id: l.id,
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    discountPercent: Number(l.discountPercent),
    amount: Number(l.amount),
  }));
  // Quantity and unit price columns only when some line needs them
  const detailed = lines.some((l) => l.quantity !== 1 || l.discountPercent > 0);
  const qty = (n: number) => n.toLocaleString(cfg.locale, { maximumFractionDigits: 2 });
  const title = creditNote ? cfg.creditNoteTitle : isReceipt ? cfg.receiptTitle : cfg.invoiceTitle;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border p-8 text-gray-900 print:shadow-none print:border-none print:rounded-none">

        {headerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed GCS URL
          <img src={headerUrl} alt="" className="mb-8 max-h-40 w-full object-contain" />
        )}

        {/* Practitioner (issuer) + document title */}
        <div className="flex justify-between items-start gap-6 mb-8">
          <IssuerBlock workspace={ws} />
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-widest">
              {title}
            </p>
            <p className="text-lg font-mono font-semibold">N° {invoice.invoiceNumber}</p>
          </div>
        </div>

        {/* Patient & dates */}
        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Facturé à</p>
            <p className="font-semibold">
              {patient.firstName} {patient.lastName}
            </p>
            {patient.address && <p className="whitespace-pre-line text-gray-600">{patient.address}</p>}
            {patient.email && <p className="text-gray-500">{patient.email}</p>}
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between gap-6">
              <span className="text-gray-400">Date d&apos;émission</span>
              <span>{d(invoice.createdAt, "dd/MM/yyyy")}</span>
            </div>
            {sessionDates.length === 1 && (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Date de la séance</span>
                <span>{d(sessionDates[0], "dd/MM/yyyy")}</span>
              </div>
            )}
            {creditNote && invoice.creditedInvoice ? (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Facture annulée</span>
                <span className="font-mono">{invoice.creditedInvoice.invoiceNumber}</span>
              </div>
            ) : (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Échéance</span>
                <span>{d(invoice.dueDate, "dd/MM/yyyy")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b text-left text-xs text-gray-400 uppercase tracking-wide">
              <th className="pb-2 font-medium">Désignation</th>
              {detailed && <th className="pb-2 pl-4 font-medium text-right">Qté</th>}
              {detailed && <th className="pb-2 pl-4 font-medium text-right">Prix unitaire</th>}
              <th className="pb-2 pl-4 font-medium text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b align-top">
                <td className="py-3">
                  {l.description}
                  {l.discountPercent > 0 && (
                    <span className="block text-xs text-gray-500">
                      Remise {qty(l.discountPercent)} %
                    </span>
                  )}
                </td>
                {detailed && <td className="py-3 pl-4 text-right tabular-nums">{qty(l.quantity)}</td>}
                {detailed && <td className="py-3 pl-4 text-right tabular-nums">{money.format(l.unitPrice)}</td>}
                <td className="py-3 pl-4 text-right tabular-nums">{money.format(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {taxAmount !== 0 && (
              <>
                <tr>
                  <td colSpan={detailed ? 3 : 1} className="pt-3 text-right text-gray-400 pr-8">
                    {ws.region === "FR" ? "Total HT" : "Sous-total"}
                  </td>
                  <td className="pt-3 text-right tabular-nums text-gray-400">{money.format(amount)}</td>
                </tr>
                {taxLines ? (
                  // Québec: TPS and TVQ on separate lines
                  taxLines.map((l) => (
                    <tr key={l.label}>
                      <td colSpan={detailed ? 3 : 1} className="pt-1 text-right text-gray-400 pr-8">
                        {l.label} ({l.rate.toLocaleString(cfg.locale, { maximumFractionDigits: 3 })} %)
                      </td>
                      <td className="pt-1 text-right tabular-nums text-gray-400">{money.format(l.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={detailed ? 3 : 1} className="pt-1 text-right text-gray-400 pr-8">
                      {ws.region === "FR" ? "TVA" : "Taxes"}
                      {taxRate > 0 && ` (${taxRate.toLocaleString(cfg.locale, { maximumFractionDigits: 3 })} %)`}
                    </td>
                    <td className="pt-1 text-right tabular-nums text-gray-400">{money.format(taxAmount)}</td>
                  </tr>
                )}
              </>
            )}
            <tr>
              <td colSpan={detailed ? 3 : 1} className="pt-2 text-right font-semibold pr-8">
                {taxAmount !== 0 ? (ws.region === "FR" ? "Total TTC" : "Total (taxes incluses)") : "Total"}
              </td>
              <td className="pt-2 text-right tabular-nums font-bold">{money.format(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Status */}
        {creditNote ? (
          <div className="text-center rounded-lg py-3 text-sm font-semibold bg-gray-50 text-gray-600">
            {invoice.creditedInvoice
              ? `Annule la facture N° ${invoice.creditedInvoice.invoiceNumber} du ${d(invoice.creditedInvoice.createdAt)}`
              : cfg.creditNoteTitle}
          </div>
        ) : cancelled ? (
          <div className="text-center rounded-lg py-3 text-sm font-semibold bg-red-50 text-red-700">
            {invoice.creditNote
              ? `Facture annulée par ${cfg.creditNoteTitle.toLowerCase()} N° ${invoice.creditNote.invoiceNumber} du ${d(invoice.creditNote.createdAt)}`
              : "Facture annulée"}
          </div>
        ) : (
          <div
            className={`text-center rounded-lg py-3 text-sm font-semibold ${
              invoice.status === "PAID"
                ? "bg-green-50 text-green-700"
                : invoice.status === "OVERDUE"
                ? "bg-red-50 text-red-700"
                : "bg-gray-50 text-gray-600"
            }`}
          >
            {isReceipt && invoice.paidAt
              ? `Acquittée le ${d(invoice.paidAt)}`
              : invoice.status === "OVERDUE"
              ? "Paiement en retard"
              : "En attente de paiement"}
          </div>
        )}

        {/* Legal mentions */}
        <div className="mt-6 space-y-1 border-t pt-4 text-xs text-gray-500">
          {taxAmount === 0 && ws.vatMention && <p>{ws.vatMention}</p>}
          {!creditNote && ws.paymentTerms && <p>Conditions de paiement : {ws.paymentTerms}</p>}
          {ws.invoiceNotes && <p className="whitespace-pre-line">{ws.invoiceNotes}</p>}
          {invoice.notes && <p className="whitespace-pre-line">{invoice.notes}</p>}
        </div>

        {footerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed GCS URL
          <img src={footerUrl} alt="" className="mt-8 max-h-32 w-full object-contain" />
        )}

        <div className="mt-8 text-center">
          <PrintButton />
        </div>
      </div>
    </div>
  );
}
