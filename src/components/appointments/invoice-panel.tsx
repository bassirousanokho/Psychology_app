"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, ExternalLink, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateInvoice } from "@/app/(dashboard)/dashboard/appointments/actions";

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  publicToken: string;
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
}

export function InvoicePanel({ appointmentId, invoice: initialInvoice, currency }: InvoicePanelProps) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const result = await generateInvoice(appointmentId);
    setLoading(false);
    if (result.success) {
      toast.success("Invoice created");
    } else {
      toast.error(result.error ?? "Failed to create invoice");
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Invoice</h2>
      </div>

      {invoice ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{invoice.invoiceNumber}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invoice.totalAmount.toFixed(2)} {currency}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANTS[invoice.status]}>
              {STATUS_LABELS[invoice.status]}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              render={<Link href={`/invoice/${invoice.publicToken}`} target="_blank" />}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            No invoice has been generated for this session yet.
          </p>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Generate invoice
          </Button>
        </div>
      )}
    </div>
  );
}
