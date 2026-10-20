"use client";

import { useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle, ExternalLink, FileText, Loader2, Mail, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const STATUS_LABELS: Record<InvoiceSummary["status"], string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
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

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) toast.success(ok);
      else toast.error(result.error ?? "Something went wrong");
    });
  }

  const paid = invoice?.status === "PAID";

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Invoice & payment</h2>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {invoice ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">{invoice.invoiceNumber}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {invoice.totalAmount.toFixed(2)} {currency}
                {paid && invoice.paidAt && ` · paid ${format(new Date(invoice.paidAt), "d MMM yyyy")}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                render={<Link href={`/invoice/${invoice.publicToken}`} target="_blank" />}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {paid ? "Receipt" : "View"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {!paid && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => run(() => markAppointmentPaid(appointmentId), "Marked as paid")}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark as paid
              </Button>
            )}
            {paid && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || !patientHasEmail}
                title={patientHasEmail ? undefined : "Add the patient's email to send a receipt"}
                onClick={() => run(() => sendReceipt(invoice.id), "Receipt sent")}
              >
                <Mail className="mr-2 h-4 w-4" />
                {invoice.receiptSentAt ? "Send receipt again" : "Send receipt"}
              </Button>
            )}
            {paid && invoice.receiptSentAt && (
              <span className="text-xs text-muted-foreground">
                Receipt sent {format(new Date(invoice.receiptSentAt), "d MMM yyyy 'at' HH:mm")}
              </span>
            )}
            {paid && !patientHasEmail && (
              <span className="text-xs text-muted-foreground">No email on file for this patient.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Payment is due at the session. Record it directly, or generate an invoice.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => run(() => markAppointmentPaid(appointmentId), "Marked as paid")}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as paid
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => generateInvoice(appointmentId), "Invoice created")}
            >
              <FileText className="mr-2 h-4 w-4" />
              Generate invoice
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
