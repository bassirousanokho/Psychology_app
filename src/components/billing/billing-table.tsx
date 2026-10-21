"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, CheckCircle, Send, Loader2, Mail, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  markInvoicePaid,
  markInvoiceUnpaid,
  sendInvoice,
} from "@/app/(dashboard)/dashboard/billing/actions";
import { sendReceipt } from "@/app/(dashboard)/dashboard/appointments/actions";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/i18n/client";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  patientName: string;
  totalAmount: number;
  kind: "INVOICE" | "CREDIT_NOTE";
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  dueDate: string;
  sentAt: string | null;
  paidAt: string | null;
  receiptSentAt: string | null;
  publicToken: string;
};

const STATUS_VARIANTS: Record<
  InvoiceRow["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SENT: "outline",
  PAID: "default",
  OVERDUE: "destructive",
  CANCELLED: "outline",
};

interface BillingTableProps {
  rows: InvoiceRow[];
  currency: string;
  locale: string;
  creditNoteLabel: string;
}

export function BillingTable({ rows, currency, locale, creditNoteLabel }: BillingTableProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { t, fmt, tError } = useI18n();

  async function run(id: string, action: () => Promise<{ success: boolean; error?: string }>, ok?: string) {
    setLoadingId(id);
    const result = await action();
    setLoadingId(null);
    if (result.success) {
      if (ok) toast.success(ok);
    } else toast.error(tError(result.error));
  }

  if (rows.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        {t("billing.empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-5 py-2.5 text-left font-medium">{t("billing.col.invoice")}</th>
            <th className="px-5 py-2.5 text-left font-medium">{t("billing.col.patient")}</th>
            <th className="px-5 py-2.5 text-left font-medium">{t("billing.col.amount")}</th>
            <th className="px-5 py-2.5 text-left font-medium">{t("billing.col.due")}</th>
            <th className="px-5 py-2.5 text-left font-medium">{t("billing.col.status")}</th>
            <th className="px-5 py-2.5 text-right font-medium">{t("billing.col.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const busy = loadingId === row.id;
            const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
            const invoice = row.kind === "INVOICE";
            const unpaid = invoice && (row.status === "DRAFT" || row.status === "SENT" || row.status === "OVERDUE");
            const paid = invoice && row.status === "PAID";
            return (
              <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-5 py-3 font-medium tabular-nums">
                  <Link href={`/dashboard/billing/${row.id}`} className="hover:underline">
                    {row.invoiceNumber}
                  </Link>
                </td>
                <td className="px-5 py-3">{row.patientName}</td>
                <td className="px-5 py-3 tabular-nums">{formatMoney(row.totalAmount, currency, locale)}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {fmt(row.dueDate, "d MMM yyyy")}
                </td>
                <td className="px-5 py-3">
                  {invoice ? (
                    <Badge variant={STATUS_VARIANTS[row.status]}>{t(`invoiceStatus.${row.status}`)}</Badge>
                  ) : (
                    <Badge variant="secondary">{creditNoteLabel}</Badge>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* View public invoice */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      render={<Link href={`/invoice/${row.publicToken}`} target="_blank" />}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>

                    {/* Email the invoice (unpaid) */}
                    {unpaid && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => run(row.id, () => sendInvoice(row.id), t("billing.sentToast"))}
                        disabled={busy}
                        title={row.sentAt ? t("billing.lastSent", { date: fmt(row.sentAt, "d MMM yyyy") }) : undefined}
                      >
                        {busy ? spinner : <Send className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{row.sentAt ? t("billing.resend") : t("billing.send")}</span>
                      </Button>
                    )}

                    {/* Mark as Paid (any unpaid invoice: payment is due at the session) */}
                    {unpaid && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => run(row.id, () => markInvoicePaid(row.id))}
                        disabled={busy}
                      >
                        {busy ? spinner : <CheckCircle className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{t("billing.paid")}</span>
                      </Button>
                    )}

                    {/* Receipt (quittance) for paid invoices */}
                    {paid && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => run(row.id, () => sendReceipt(row.id), t("billing.receiptToast"))}
                        disabled={busy}
                        title={row.receiptSentAt ? t("billing.lastSent", { date: fmt(row.receiptSentAt, "d MMM yyyy") }) : undefined}
                      >
                        {busy ? spinner : <Mail className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{row.receiptSentAt ? t("billing.resendReceipt") : t("billing.receipt")}</span>
                      </Button>
                    )}

                    {/* Undo "paid" clicked by mistake */}
                    {paid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        title={t("billing.undoPaid")}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(t("billing.confirmUnpaid", { number: row.invoiceNumber }))) {
                            run(row.id, () => markInvoiceUnpaid(row.id), t("billing.unpaidToast"));
                          }
                        }}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
