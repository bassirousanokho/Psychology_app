import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceEditor } from "@/components/billing/invoice-editor";
import { InvoiceActions } from "@/components/billing/invoice-actions";
import prisma from "@/lib/prisma";
import { isEditable } from "@/lib/invoices";
import { invoicePresets } from "@/lib/invoice-presets";
import { regionConfig } from "@/lib/regions";
import type { TaxLine } from "@/lib/taxes";
import { getI18n } from "@/i18n/server";

const STATUS_VARIANTS = {
  DRAFT: "secondary",
  SENT: "outline",
  PAID: "default",
  OVERDUE: "destructive",
  CANCELLED: "outline",
} as const;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: userId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
      lines: { orderBy: { position: "asc" } },
      appointments: { select: { id: true, startTime: true }, orderBy: { startTime: "asc" } },
      creditedInvoice: { select: { id: true, invoiceNumber: true } },
      creditNote: { select: { id: true, invoiceNumber: true } },
      workspace: {
        select: {
          currency: true,
          region: true,
          gstRate: true,
          qstRate: true,
          taxRate: true,
          defaultTariff: true,
          hourlyRateAdmin: true,
          hourlyRateWriting: true,
          hourlyRateConference: true,
        },
      },
    },
  });
  if (!invoice) notFound();

  const { t, fmt, money: formatMoney } = await getI18n(userId);
  const ws = invoice.workspace;
  const cfg = regionConfig(ws.region);
  const money = (n: number) => formatMoney(n, ws.currency);
  const editable = isEditable(invoice);
  const creditNote = invoice.kind === "CREDIT_NOTE";
  const taxLines = Array.isArray(invoice.taxLines) ? (invoice.taxLines as unknown as TaxLine[]) : null;
  const lines = invoice.lines.map((l) => ({
    appointmentId: l.appointmentId,
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    discountPercent: Number(l.discountPercent),
    taxRate: Number(l.taxRate),
    amount: Number(l.amount),
  }));

  return (
    <>
      <Header title={creditNote ? cfg.creditNoteTitle : t("invoiceView.title")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href="/dashboard/billing" />}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("invoiceView.back")}
          </Button>

          {/* Summary + actions */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-mono text-xl font-semibold">{invoice.invoiceNumber}</h1>
                  {creditNote ? (
                    <Badge variant="secondary">{cfg.creditNoteTitle}</Badge>
                  ) : (
                    <Badge variant={STATUS_VARIANTS[invoice.status]}>{t(`invoiceStatus.${invoice.status}`)}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Link href={`/dashboard/patients/${invoice.patient.id}`} className="font-medium text-foreground hover:underline">
                    {invoice.patient.lastName}, {invoice.patient.firstName}
                  </Link>
                  {" · "}
                  {t("invoiceView.issued", { date: fmt(invoice.createdAt, "d MMM yyyy") })}
                  {invoice.paidAt && !creditNote && ` · ${t("invoiceView.paidOn", { date: fmt(invoice.paidAt, "d MMM yyyy") })}`}
                  {invoice.paidAt && creditNote && ` · ${t("invoiceView.refundedOn", { date: fmt(invoice.paidAt, "d MMM yyyy") })}`}
                  {invoice.sentAt && ` · ${t("invoiceView.sentOn", { date: fmt(invoice.sentAt, "d MMM yyyy") })}`}
                </p>
              </div>
              <p className="text-xl font-semibold tabular-nums">{money(Number(invoice.totalAmount))}</p>
            </div>

            {/* Related documents */}
            {(invoice.creditNote || invoice.creditedInvoice || invoice.status === "CANCELLED") && (
              <div className="rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
                {invoice.creditedInvoice && (
                  <p>
                    {t("invoiceView.cancels")}{" "}
                    <Link href={`/dashboard/billing/${invoice.creditedInvoice.id}`} className="font-mono underline underline-offset-2">
                      {invoice.creditedInvoice.invoiceNumber}
                    </Link>
                  </p>
                )}
                {invoice.status === "CANCELLED" && (
                  <p>
                    {invoice.cancelledAt && t("invoiceView.cancelledOn", { date: fmt(invoice.cancelledAt, "d MMM yyyy") })}
                    {invoice.creditNote && (
                      <>
                        {" · "}
                        {cfg.creditNoteTitle}{" "}
                        <Link href={`/dashboard/billing/${invoice.creditNote.id}`} className="font-mono underline underline-offset-2">
                          {invoice.creditNote.invoiceNumber}
                        </Link>
                      </>
                    )}
                    {invoice.cancelReason && <span className="block text-muted-foreground">{invoice.cancelReason}</span>}
                  </p>
                )}
              </div>
            )}

            <InvoiceActions
              id={invoice.id}
              number={invoice.invoiceNumber}
              kind={invoice.kind}
              status={invoice.status}
              editable={editable}
              publicToken={invoice.publicToken}
              sentAt={invoice.sentAt?.toISOString() ?? null}
              receiptSentAt={invoice.receiptSentAt?.toISOString() ?? null}
              patientHasEmail={!!invoice.patient.email}
              creditNoteLabel={cfg.creditNoteTitle}
            />
            {!editable && !creditNote && invoice.status !== "CANCELLED" && (
              <p className="text-xs text-muted-foreground">
                {t("invoiceView.lockedHint", { doc: cfg.creditNoteTitle.toLowerCase() })}
              </p>
            )}
          </div>

          {editable ? (
            <InvoiceEditor
              invoiceId={invoice.id}
              patients={[invoice.patient]}
              initialPatientId={invoice.patient.id}
              initialLines={lines}
              initialDueDate={format(invoice.dueDate, "yyyy-MM-dd")}
              initialNotes={invoice.notes ?? ""}
              currency={ws.currency}
              region={ws.region}
              gstRate={Number(ws.gstRate)}
              qstRate={Number(ws.qstRate)}
              defaultTaxRate={Number(ws.taxRate)}
              presets={invoicePresets(ws)}
            />
          ) : (
            <div className="rounded-xl border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-5 py-2.5 text-left font-medium">{t("invoiceEditor.description")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("invoiceEditor.qty")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("invoiceEditor.unitPrice")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("invoiceEditor.discount")}</th>
                      <th className="px-5 py-2.5 text-right font-medium">{t("billing.col.amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-5 py-2.5">
                          {l.appointmentId ? (
                            <Link href={`/dashboard/appointments/${l.appointmentId}`} className="hover:underline">
                              {l.description}
                            </Link>
                          ) : (
                            l.description
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(l.unitPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{l.discountPercent > 0 ? `${l.discountPercent} %` : "—"}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto max-w-xs space-y-1 border-t px-5 py-4 text-sm">
                {Number(invoice.taxAmount) !== 0 && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <dt>{t("invoiceEditor.subtotal")}</dt>
                      <dd className="tabular-nums">{money(Number(invoice.amount))}</dd>
                    </div>
                    {(taxLines ?? [{ label: t("invoiceEditor.taxes"), rate: Number(invoice.taxRate), amount: Number(invoice.taxAmount) }]).map((tl) => (
                      <div key={tl.label + tl.rate} className="flex justify-between text-muted-foreground">
                        <dt>{tl.label}{tl.rate > 0 && ` (${tl.rate} %)`}</dt>
                        <dd className="tabular-nums">{money(tl.amount)}</dd>
                      </div>
                    ))}
                  </>
                )}
                <div className="flex justify-between font-semibold">
                  <dt>{t("invoiceEditor.total")}</dt>
                  <dd className="tabular-nums">{money(Number(invoice.totalAmount))}</dd>
                </div>
              </dl>
              {invoice.notes && (
                <p className="whitespace-pre-line border-t px-5 py-3 text-sm text-muted-foreground">{invoice.notes}</p>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
