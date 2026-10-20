"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, CheckCircle, Send, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markInvoicePaid, markInvoiceSent } from "@/app/(dashboard)/dashboard/billing/actions";
import { sendReceipt } from "@/app/(dashboard)/dashboard/appointments/actions";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  patientName: string;
  totalAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  dueDate: string;
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
};

interface BillingTableProps {
  rows: InvoiceRow[];
  currency: string;
}

export function BillingTable({ rows, currency }: BillingTableProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleMarkSent(id: string) {
    setLoadingId(id);
    const result = await markInvoiceSent(id);
    setLoadingId(null);
    if (!result.success) toast.error(result.error ?? "Failed");
  }

  async function handleSendReceipt(id: string) {
    setLoadingId(id);
    const result = await sendReceipt(id);
    setLoadingId(null);
    if (result.success) toast.success("Receipt sent");
    else toast.error(result.error ?? "Failed");
  }

  async function handleMarkPaid(id: string) {
    setLoadingId(id);
    const result = await markInvoicePaid(id);
    setLoadingId(null);
    if (!result.success) toast.error(result.error ?? "Failed");
  }

  if (rows.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No invoices yet. Generate one from a completed appointment.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-5 py-2.5 text-left font-medium">Invoice</th>
            <th className="px-5 py-2.5 text-left font-medium">Patient</th>
            <th className="px-5 py-2.5 text-left font-medium">Amount</th>
            <th className="px-5 py-2.5 text-left font-medium">Due</th>
            <th className="px-5 py-2.5 text-left font-medium">Status</th>
            <th className="px-5 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const busy = loadingId === row.id;
            return (
              <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-5 py-3 font-medium tabular-nums">{row.invoiceNumber}</td>
                <td className="px-5 py-3">{row.patientName}</td>
                <td className="px-5 py-3 tabular-nums">
                  {row.totalAmount.toFixed(2)} {currency}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {format(new Date(row.dueDate), "d MMM yyyy")}
                </td>
                <td className="px-5 py-3">
                  <Badge variant={STATUS_VARIANTS[row.status]}>{row.status}</Badge>
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

                    {/* Mark as Sent (DRAFT only) */}
                    {row.status === "DRAFT" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleMarkSent(row.id)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">Sent</span>
                      </Button>
                    )}

                    {/* Mark as Paid (any unpaid invoice: payment is due at the session) */}
                    {row.status !== "PAID" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleMarkPaid(row.id)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">Paid</span>
                      </Button>
                    )}

                    {/* Receipt (quittance) for paid invoices */}
                    {row.status === "PAID" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleSendReceipt(row.id)}
                        disabled={busy}
                        title={row.receiptSentAt ? `Last sent ${format(new Date(row.receiptSentAt), "d MMM yyyy")}` : undefined}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{row.receiptSentAt ? "Resend receipt" : "Receipt"}</span>
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
