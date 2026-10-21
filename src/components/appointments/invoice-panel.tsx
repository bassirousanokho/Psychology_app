"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle, ExternalLink, FileText, Loader2, Mail, Receipt, Send, Undo2 } from "lucide-react";
import { markInvoiceUnpaid, sendInvoice } from "@/app/(dashboard)/dashboard/billing/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/client";
import {
  generateInvoice,
  markAppointmentPaid,
  sendReceipt,
} from "@/app/(dashboard)/dashboard/appointments/actions";

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  publicToken: string;
  paidAt: string | null;        // ISO
  receiptSentAt: string | null; // ISO
};

const STATUS_VARIANTS: Record<
  InvoiceSummary["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SENT: "default",
  PAID: "default",
  OVERDUE: "destructive",
};

interface InvoicePanelProps {
  appointmentId: string;
  invoice: InvoiceSummary | null;
  currency: string;
  patientHasEmail: boolean;
}

// `invoice` comes from the server: the actions revalidate the page, so changes
// arrive as props (no local copy that could go stale)
export function InvoicePanel({ appointmentId, invoice, currency, patientHasEmail }: InvoicePanelProps) {
  const [isPending, startTransition] = useTransition();
  const { t, fmt, tError, money: formatAmount } = useI18n();
  const money = (n: number) => formatAmount(n, currency);

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) toast.success(ok);
      else toast.error(tError(result.error));
    });
  }

  const paid = invoice?.status === "PAID";

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">{t("invoicePanel.title")}</h2>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {invoice ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">{invoice.invoiceNumber}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {money(invoice.totalAmount)}
                {paid && invoice.paidAt && t("invoicePanel.paidOn", { date: fmt(invoice.paidAt, "d MMM yyyy") })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[invoice.status]}>{t(`invoiceStatus.${invoice.status}`)}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                render={<Link href={`/invoice/${invoice.publicToken}`} target="_blank" />}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {paid ? t("invoicePanel.receipt") : t("invoicePanel.view")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {!paid && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => run(() => markAppointmentPaid(appointmentId), t("invoicePanel.markedPaid"))}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {t("invoicePanel.markPaid")}
              </Button>
            )}
            {!paid && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || !patientHasEmail}
                title={patientHasEmail ? undefined : t("common.noEmailHint")}
                onClick={() => run(() => sendInvoice(invoice.id), t("invoicePanel.sent"))}
              >
                <Send className="mr-2 h-4 w-4" />
                {t("invoicePanel.send")}
              </Button>
            )}
            {paid && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={isPending}
                onClick={() => {
                  if (window.confirm(t("invoicePanel.confirmUnpaid", { number: invoice.invoiceNumber }))) {
                    run(() => markInvoiceUnpaid(invoice.id), t("invoicePanel.markedUnpaid"));
                  }
                }}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                {t("invoicePanel.markUnpaid")}
              </Button>
            )}
            {paid && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || !patientHasEmail}
                title={patientHasEmail ? undefined : t("common.noEmailHint")}
                onClick={() => run(() => sendReceipt(invoice.id), t("invoicePanel.receiptSent"))}
              >
                <Mail className="mr-2 h-4 w-4" />
                {invoice.receiptSentAt ? t("invoicePanel.sendReceiptAgain") : t("invoicePanel.sendReceipt")}
              </Button>
            )}
            {paid && invoice.receiptSentAt && (
              <span className="text-xs text-muted-foreground">
                {t("invoicePanel.receiptSentOn", { date: fmt(invoice.receiptSentAt, "d MMM yyyy, HH:mm") })}
              </span>
            )}
            {paid && !patientHasEmail && (
              <span className="text-xs text-muted-foreground">{t("invoicePanel.noEmail")}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t("invoicePanel.dueHint")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => run(() => markAppointmentPaid(appointmentId), t("invoicePanel.markedPaid"))}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {t("invoicePanel.markPaid")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => generateInvoice(appointmentId), t("invoicePanel.created"))}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t("invoicePanel.generate")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
