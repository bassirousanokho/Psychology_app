import { notFound } from "next/navigation";
import { differenceInMinutes, format } from "date-fns";
import { fr, frCA } from "date-fns/locale";
import { formatDuration, isHourly, SESSION_TYPE_INVOICE_LABELS } from "@/lib/session-types";
import { formatLegalValue } from "@/lib/invoice-legal";
import { regionConfig } from "@/lib/regions";
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
      appointment: {
        select: { startTime: true, endTime: true, type: true, status: true, cancellationFee: true },
      },
    },
  });

  if (!invoice) notFound();

  const { patient, workspace: ws, appointment } = invoice;
  const cfg = regionConfig(ws.region);
  const dateLocale = cfg.locale === "fr-CA" ? frCA : fr;
  const d = (date: Date, pattern = "d MMMM yyyy") => format(date, pattern, { locale: dateLocale });
  const money = new Intl.NumberFormat(cfg.locale, { style: "currency", currency: ws.currency });
  const amount = Number(invoice.amount);
  const taxAmount = Number(invoice.taxAmount);
  const totalAmount = Number(invoice.totalAmount);
  const taxRate = Number(invoice.taxRate);
  const isReceipt = invoice.status === "PAID" && invoice.paidAt !== null;

  const [headerUrl, footerUrl] = await Promise.all([
    ws.invoiceHeaderKey ? getSignedReadUrl(ws.invoiceHeaderKey) : null,
    ws.invoiceFooterKey ? getSignedReadUrl(ws.invoiceFooterKey) : null,
  ]);

  let lineDescription = SESSION_TYPE_INVOICE_LABELS.PSYCHOTHERAPY;
  if (appointment) {
    const date = d(appointment.startTime);
    const minutes = differenceInMinutes(appointment.endTime, appointment.startTime);
    if (appointment.status === "CANCELLED" && appointment.cancellationFee) {
      lineDescription = `Frais d'annulation — séance du ${date}`;
    } else if (isHourly(appointment.type)) {
      lineDescription = `${SESSION_TYPE_INVOICE_LABELS[appointment.type]} — ${date} (${formatDuration(minutes)})`;
    } else {
      lineDescription = `${SESSION_TYPE_INVOICE_LABELS[appointment.type]} — ${date}`;
    }
  }

  const practitionerName = ws.practitionerName || ws.name;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border p-8 text-gray-900 print:shadow-none print:border-none print:rounded-none">

        {headerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed GCS URL
          <img src={headerUrl} alt="" className="mb-8 max-h-40 w-full object-contain" />
        )}

        {/* Practitioner (issuer) + document title */}
        <div className="flex justify-between items-start gap-6 mb-8">
          <div className="text-sm leading-relaxed">
            <p className="text-lg font-bold">{practitionerName}</p>
            {ws.professionalTitle && <p className="text-gray-600">{ws.professionalTitle}</p>}
            {ws.address && <p className="whitespace-pre-line text-gray-600">{ws.address}</p>}
            <div className="mt-2 space-y-0.5 text-xs text-gray-500">
              {cfg.legalFields.map((f) =>
                ws[f.key] ? (
                  <p key={f.key}>
                    {f.invoiceLabel} : {formatLegalValue(f.key, ws[f.key]!)}
                  </p>
                ) : null,
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-widest">
              {isReceipt ? cfg.receiptTitle : cfg.invoiceTitle}
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
            {appointment && (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Date de la séance</span>
                <span>{d(appointment.startTime, "dd/MM/yyyy")}</span>
              </div>
            )}
            <div className="flex justify-between gap-6">
              <span className="text-gray-400">Échéance</span>
              <span>{d(invoice.dueDate, "dd/MM/yyyy")}</span>
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b text-left text-xs text-gray-400 uppercase tracking-wide">
              <th className="pb-2 font-medium">Désignation</th>
              <th className="pb-2 font-medium text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3">{lineDescription}</td>
              <td className="py-3 text-right tabular-nums">{money.format(amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            {taxRate > 0 && (
              <>
                <tr>
                  <td className="pt-3 text-right text-gray-400 pr-8">
                    {ws.region === "FR" ? "Total HT" : "Sous-total"}
                  </td>
                  <td className="pt-3 text-right tabular-nums text-gray-400">{money.format(amount)}</td>
                </tr>
                <tr>
                  <td className="pt-1 text-right text-gray-400 pr-8">
                    {ws.region === "FR" ? "TVA" : "Taxes"} ({taxRate.toLocaleString(cfg.locale, { maximumFractionDigits: 3 })} %)
                  </td>
                  <td className="pt-1 text-right tabular-nums text-gray-400">{money.format(taxAmount)}</td>
                </tr>
              </>
            )}
            <tr>
              <td className="pt-2 text-right font-semibold pr-8">
                {taxRate > 0 ? (ws.region === "FR" ? "Total TTC" : "Total (taxes incluses)") : "Total"}
              </td>
              <td className="pt-2 text-right tabular-nums font-bold">{money.format(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Status */}
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

        {/* Legal mentions */}
        <div className="mt-6 space-y-1 border-t pt-4 text-xs text-gray-500">
          {taxRate === 0 && ws.vatMention && <p>{ws.vatMention}</p>}
          {ws.paymentTerms && <p>Conditions de paiement : {ws.paymentTerms}</p>}
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
