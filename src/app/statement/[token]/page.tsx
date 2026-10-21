import { notFound } from "next/navigation";
import { addDays, format } from "date-fns";
import { fr, frCA } from "date-fns/locale";
import prisma from "@/lib/prisma";
import { regionConfig } from "@/lib/regions";
import { getSignedReadUrl } from "@/lib/gcs";
import { IssuerBlock, ISSUER_SELECT } from "@/components/billing/issuer-block";
import { PrintButton } from "@/components/billing/print-button";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Statement of payments for a period, mainly for insurance claims. Issued in
// French like invoices (France; Québec's Charter of the French language).
export default async function StatementPage({ params }: PageProps) {
  const { token } = await params;

  const statement = await prisma.statement.findUnique({
    where: { publicToken: token },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, address: true } },
      workspace: { select: { ...ISSUER_SELECT, currency: true, invoiceHeaderKey: true, invoiceFooterKey: true } },
    },
  });
  if (!statement) notFound();

  const { patient, workspace: ws } = statement;
  const cfg = regionConfig(ws.region);
  const dateLocale = cfg.locale === "fr-CA" ? frCA : fr;
  const d = (date: Date, pattern = "d MMMM yyyy") => format(date, pattern, { locale: dateLocale });
  const money = new Intl.NumberFormat(cfg.locale, { style: "currency", currency: ws.currency });

  // Payments received in the period (inclusive of the last day)
  const invoices = await prisma.invoice.findMany({
    where: {
      patientId: patient.id,
      workspaceId: statement.workspaceId,
      kind: "INVOICE",
      status: "PAID", // invoices cancelled since are left out
      paidAt: { gte: statement.periodStart, lt: addDays(statement.periodEnd, 1) },
    },
    orderBy: { paidAt: "asc" },
    include: {
      lines: { orderBy: { position: "asc" }, select: { description: true, appointment: { select: { startTime: true } } } },
    },
  });
  const total = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);

  const [headerUrl, footerUrl] = await Promise.all([
    ws.invoiceHeaderKey ? getSignedReadUrl(ws.invoiceHeaderKey) : null,
    ws.invoiceFooterKey ? getSignedReadUrl(ws.invoiceFooterKey) : null,
  ]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border p-8 text-gray-900 print:shadow-none print:border-none print:rounded-none">
        {headerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed GCS URL
          <img src={headerUrl} alt="" className="mb-8 max-h-40 w-full object-contain" />
        )}

        <div className="flex justify-between items-start gap-6 mb-8">
          <IssuerBlock workspace={ws} />
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Relevé de paiements</p>
            <p className="text-sm font-semibold">
              du {d(statement.periodStart)}
              <br />
              au {d(statement.periodEnd)}
            </p>
          </div>
        </div>

        <div className="mb-8 text-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Patient</p>
          <p className="font-semibold">
            {patient.firstName} {patient.lastName}
          </p>
          {patient.address && <p className="whitespace-pre-line text-gray-600">{patient.address}</p>}
        </div>

        {invoices.length === 0 ? (
          <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-500">
            Aucun paiement reçu pendant cette période.
          </p>
        ) : (
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="pb-2 font-medium">Date du service</th>
                <th className="pb-2 font-medium">Désignation</th>
                <th className="pb-2 font-medium">Reçu</th>
                <th className="pb-2 font-medium text-right">Montant payé</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const dates = [...new Set(inv.lines.flatMap((l) => (l.appointment ? [d(l.appointment.startTime, "dd/MM/yyyy")] : [])))];
                return (
                  <tr key={inv.id} className="border-b align-top">
                    <td className="py-2">{dates.length ? dates.join(", ") : "—"}</td>
                    <td className="py-2">{inv.lines.map((l) => l.description.split(" — ")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</td>
                    <td className="py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="py-2 text-right tabular-nums">{money.format(Number(inv.totalAmount))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-right font-semibold pr-8">
                  Total payé ({invoices.length} {invoices.length > 1 ? "paiements" : "paiement"})
                </td>
                <td className="pt-3 text-right tabular-nums font-bold">{money.format(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <p className="border-t pt-4 text-xs text-gray-500">
          Relevé émis le {d(statement.createdAt)} à des fins de remboursement par l&apos;assureur.
          {ws.region === "CA-QC" && ws.permitNumber && ` Psychologue membre de l'Ordre des psychologues du Québec, permis n° ${ws.permitNumber}.`}
        </p>

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
