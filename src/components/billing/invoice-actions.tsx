"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle, ExternalLink, Loader2, Mail, Send, Undo2 } from "lucide-react";
import {
  cancelInvoice,
  markInvoicePaid,
  markInvoiceUnpaid,
  sendInvoice,
} from "@/app/(dashboard)/dashboard/billing/actions";
import { sendReceipt } from "@/app/(dashboard)/dashboard/appointments/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";

export type InvoiceActionsProps = {
  id: string;
  number: string;
  kind: "INVOICE" | "CREDIT_NOTE";
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  editable: boolean; // draft never sent: withdrawn without a credit note
  publicToken: string;
  sentAt: string | null;
  receiptSentAt: string | null;
  patientHasEmail: boolean;
  creditNoteLabel: string; // "Note de crédit" / "Avoir"
};

export function InvoiceActions(p: InvoiceActionsProps) {
  const router = useRouter();
  const { t, fmt, tError } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) toast.success(ok);
      else toast.error(tError(result.error));
    });
  }

  const creditNote = p.kind === "CREDIT_NOTE";
  const unpaid = !creditNote && (p.status === "DRAFT" || p.status === "SENT" || p.status === "OVERDUE");
  const paid = !creditNote && p.status === "PAID";
  const noEmail = p.patientHasEmail ? undefined : t("common.noEmailHint");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Button variant="outline" size="sm" render={<Link href={`/invoice/${p.publicToken}`} target="_blank" />}>
        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
        {t("invoiceView.open")}
      </Button>

      {(unpaid || (creditNote && p.status !== "CANCELLED")) && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || !p.patientHasEmail}
          title={noEmail ?? (p.sentAt ? t("billing.lastSent", { date: fmt(p.sentAt, "d MMM yyyy") }) : undefined)}
          onClick={() => run(() => sendInvoice(p.id), t("billing.sentToast"))}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {p.sentAt ? t("billing.resend") : t("billing.send")}
        </Button>
      )}

      {unpaid && (
        <Button size="sm" disabled={isPending} onClick={() => run(() => markInvoicePaid(p.id), t("invoicePanel.markedPaid"))}>
          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
          {t("invoicePanel.markPaid")}
        </Button>
      )}

      {paid && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || !p.patientHasEmail}
          title={noEmail}
          onClick={() => run(() => sendReceipt(p.id), t("billing.receiptToast"))}
        >
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          {p.receiptSentAt ? t("billing.resendReceipt") : t("billing.receipt")}
        </Button>
      )}

      {paid && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={isPending}
          onClick={() => {
            if (window.confirm(t("billing.confirmUnpaid", { number: p.number }))) {
              run(() => markInvoiceUnpaid(p.id), t("billing.unpaidToast"));
            }
          }}
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          {t("billing.undoPaid")}
        </Button>
      )}

      {!creditNote && p.status !== "CANCELLED" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={() => setCancelOpen(true)}
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          {p.editable ? t("invoiceView.withdraw") : t("invoiceView.cancelCredit", { doc: p.creditNoteLabel.toLowerCase() })}
        </Button>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          {cancelOpen && (
            <CancelForm
              {...p}
              paid={paid}
              onDone={(correctedId) => {
                setCancelOpen(false);
                if (correctedId) router.push(`/dashboard/billing/${correctedId}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CancelForm({
  id,
  number,
  editable,
  paid,
  creditNoteLabel,
  onDone,
}: InvoiceActionsProps & { paid: boolean; onDone: (correctedId: string | null) => void }) {
  const { t, tError } = useI18n();
  const [reason, setReason] = useState("");
  const [correct, setCorrect] = useState(true);
  const [refunded, setRefunded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const doc = creditNoteLabel.toLowerCase();

  function submit() {
    startTransition(async () => {
      const result = await cancelInvoice(id, { reason, correct, refunded: refunded || !correct });
      if (!result.success) {
        toast.error(tError(result.error));
        return;
      }
      toast.success(editable ? t("invoiceView.withdrawn") : t("invoiceView.credited", { doc }));
      onDone(result.correctedId);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editable ? t("invoiceView.withdrawTitle", { number }) : t("invoiceView.cancelTitle", { number })}
        </DialogTitle>
        <DialogDescription>
          {editable ? t("invoiceView.withdrawBody") : t("invoiceView.cancelBody", { doc })}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reason">{t("invoiceView.reason")}</Label>
          <Textarea
            id="reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("invoiceView.reasonPlaceholder")}
          />
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={correct} onChange={(e) => setCorrect(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            {t("invoiceView.correct")}
            <span className="block text-xs text-muted-foreground">{t("invoiceView.correctHint")}</span>
          </span>
        </label>
        {paid && !editable && correct && (
          <fieldset className="space-y-1.5 rounded-lg border p-3 text-sm">
            <legend className="px-1 text-xs font-medium text-muted-foreground">{t("invoiceView.payment")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!refunded} onChange={() => setRefunded(false)} className="accent-primary" />
              {t("invoiceView.carryOver")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={refunded} onChange={() => setRefunded(true)} className="accent-primary" />
              {t("invoiceView.refunded")}
            </label>
            {!refunded && <p className="text-xs text-muted-foreground">{t("invoiceView.carryOverHint")}</p>}
          </fieldset>
        )}
        {paid && !editable && !correct && (
          <p className="text-xs text-muted-foreground">{t("invoiceView.refundHint")}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="destructive" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editable ? t("invoiceView.withdraw") : t("invoiceView.confirmCancel", { doc })}
        </Button>
      </DialogFooter>
    </>
  );
}
