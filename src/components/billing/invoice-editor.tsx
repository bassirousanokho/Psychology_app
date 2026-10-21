"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  getBillableSessions,
  saveInvoice,
  type BillableSession,
} from "@/app/(dashboard)/dashboard/billing/actions";
import { PatientCombobox, type PatientOption } from "@/components/calendar/patient-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { invoiceTotals, lineAmount } from "@/lib/invoice-math";
import { SESSION_TYPE_INVOICE_LABELS, type SessionType } from "@/lib/session-types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type EditorLineInput = {
  appointmentId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
};

type EditorLine = {
  key: string;
  appointmentId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
};

export type ServicePreset = { type: SessionType; unitPrice: number; hourly: boolean };

interface InvoiceEditorProps {
  invoiceId?: string;
  patients: PatientOption[];
  initialPatientId: string;
  initialLines: EditorLineInput[];
  initialDueDate: string; // YYYY-MM-DD
  initialNotes: string;
  preselectAppointmentId?: string;
  currency: string;
  region: string;
  gstRate: number;
  qstRate: number;
  defaultTaxRate: number;
  presets: ServicePreset[];
}

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

function toEditor(l: EditorLineInput): EditorLine {
  return {
    key: nextKey(),
    appointmentId: l.appointmentId,
    description: l.description,
    quantity: String(l.quantity),
    unitPrice: l.unitPrice.toFixed(2),
    discountPercent: String(l.discountPercent),
    taxRate: String(l.taxRate),
  };
}

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function InvoiceEditor({
  invoiceId,
  patients,
  initialPatientId,
  initialLines,
  initialDueDate,
  initialNotes,
  preselectAppointmentId,
  currency,
  region,
  gstRate,
  qstRate,
  defaultTaxRate,
  presets,
}: InvoiceEditorProps) {
  const router = useRouter();
  const { t, fmt, money, tError } = useI18n();
  const [patientId, setPatientId] = useState(initialPatientId);
  const [lines, setLines] = useState<EditorLine[]>(() => initialLines.map(toEditor));
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [notes, setNotes] = useState(initialNotes);
  const [sessions, setSessions] = useState<BillableSession[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preselect, setPreselect] = useState(preselectAppointmentId);

  // Sessions of the chosen patient that can be billed
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    getBillableSessions(patientId, invoiceId).then((rows) => {
      if (cancelled) return;
      setSessions(rows);
      const pre = preselect && rows.find((s) => s.id === preselect);
      if (pre) {
        setLines((ls) => (ls.some((l) => l.appointmentId === pre.id) ? ls : [...ls, toEditor(pre.line)]));
        setPreselect(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [patientId, invoiceId, preselect]);

  const showTax = defaultTaxRate > 0 || lines.some((l) => num(l.taxRate) > 0);
  const parsed = lines.map((l) => ({
    quantity: num(l.quantity),
    unitPrice: num(l.unitPrice),
    discountPercent: l.discountPercent.trim() === "" ? 0 : num(l.discountPercent),
    taxRate: l.taxRate.trim() === "" ? 0 : num(l.taxRate),
  }));
  const valid = parsed.every(
    (p, i) =>
      lines[i].description.trim() !== "" &&
      p.quantity > 0 &&
      p.unitPrice >= 0 &&
      p.discountPercent >= 0 &&
      p.discountPercent <= 100 &&
      p.taxRate >= 0,
  );
  const totals = valid ? invoiceTotals(parsed, region, gstRate, qstRate) : null;

  function update(key: string, patch: Partial<EditorLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function toggleSession(s: BillableSession, on: boolean) {
    setLines((ls) => (on ? [...ls, toEditor(s.line)] : ls.filter((l) => l.appointmentId !== s.id)));
  }

  function addPreset(p: ServicePreset | null) {
    setLines((ls) => [
      ...ls,
      toEditor({
        appointmentId: null,
        description: p ? SESSION_TYPE_INVOICE_LABELS[p.type] : "",
        quantity: 1,
        unitPrice: p?.unitPrice ?? 0,
        discountPercent: 0,
        taxRate: defaultTaxRate,
      }),
    ]);
  }

  function handleSave() {
    if (!patientId) return toast.error(t("invoiceEditor.choosePatient"));
    if (!valid) return toast.error(t("invoiceEditor.fixLines"));
    startTransition(async () => {
      const result = await saveInvoice({
        invoiceId,
        patientId,
        dueDate,
        notes,
        lines: lines.map((l, i) => ({
          appointmentId: l.appointmentId,
          description: l.description.trim(),
          ...parsed[i],
        })),
      });
      if (!result.success) {
        toast.error(tError(result.error));
        return;
      }
      toast.success(invoiceId ? t("invoiceEditor.saved") : t("invoiceEditor.created"));
      if (invoiceId) router.refresh();
      else router.push(`/dashboard/billing/${result.invoiceId}`);
    });
  }

  const sessionLabel = (s: BillableSession) =>
    s.status === "CANCELLED"
      ? t("invoiceEditor.cancellationFee")
      : s.status === "NO_SHOW"
      ? t("status.NO_SHOW")
      : t(`type.${s.type}`);

  return (
    <div className="space-y-6">
      {/* Patient */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("invoiceEditor.patient")}</Label>
            {invoiceId ? (
              <p className="flex h-9 items-center text-sm font-medium">
                {patients[0] ? `${patients[0].lastName}, ${patients[0].firstName}` : ""}
              </p>
            ) : (
              <PatientCombobox
                patients={patients}
                value={patientId}
                onChange={(id) => {
                  if (id === patientId) return;
                  setPatientId(id);
                  setSessions(null);
                  // Sessions belong to one patient: drop those of the previous one
                  setLines((ls) => ls.filter((l) => !l.appointmentId));
                }}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">{t("invoiceEditor.dueDate")}</Label>
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-44" />
          </div>
        </div>

        {/* Sessions to bill */}
        {patientId && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("invoiceEditor.sessions")}
            </p>
            {sessions === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("invoiceEditor.noSessions")}</p>
            ) : (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                {sessions.map((s) => {
                  const on = lines.some((l) => l.appointmentId === s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => toggleSession(s, e.target.checked)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="flex-1">
                          {fmt(s.startTime, "EEE d MMM yyyy, HH:mm")}
                          <span className="ml-2 text-xs text-muted-foreground">{sessionLabel(s)}</span>
                        </span>
                        {s.status === "SCHEDULED" && (
                          <Badge variant="secondary" className="text-[10px]">{t("status.SCHEDULED")}</Badge>
                        )}
                        <span className="tabular-nums text-muted-foreground">
                          {money(lineAmount(s.line), currency)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold">{t("invoiceEditor.lines")}</h2>
          <p className="text-xs text-muted-foreground">{t("invoiceEditor.linesHint")}</p>
        </div>
        <div className="divide-y">
          {lines.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t("invoiceEditor.empty")}</p>
          )}
          {lines.map((l, i) => {
            const p = parsed[i];
            const amount = p.quantity > 0 && p.unitPrice >= 0 ? lineAmount(p) : null;
            return (
              <div key={l.key} className="grid gap-2 px-5 py-3 sm:grid-cols-12 sm:items-end">
                <div className="space-y-1 sm:col-span-5">
                  <Label className="text-xs text-muted-foreground">
                    {t("invoiceEditor.description")}
                    {l.appointmentId && <span className="ml-1.5 text-primary">· {t("invoiceEditor.linkedSession")}</span>}
                  </Label>
                  <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:col-span-5 sm:grid-cols-[1fr_1.4fr_1fr_1fr]">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("invoiceEditor.qty")}</Label>
                    <Input inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("invoiceEditor.unitPrice")}</Label>
                    <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("invoiceEditor.discount")}</Label>
                    <Input inputMode="decimal" value={l.discountPercent} onChange={(e) => update(l.key, { discountPercent: e.target.value })} />
                  </div>
                  {showTax && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("invoiceEditor.tax")}</Label>
                      <Input inputMode="decimal" value={l.taxRate} onChange={(e) => update(l.key, { taxRate: e.target.value })} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 sm:col-span-2 sm:justify-end">
                  <span className={cn("text-sm font-medium tabular-nums", amount === null && "text-destructive")}>
                    {amount === null ? "—" : money(amount, currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={t("invoiceEditor.removeLine")}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => addPreset(null)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("invoiceEditor.addLine")}
          </Button>
          {presets.map((p) => (
            <Button key={p.type} variant="ghost" size="sm" onClick={() => addPreset(p)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t(`type.${p.type}`)}
              {p.hourly && <span className="ml-1 text-muted-foreground">{t("invoiceEditor.perHour")}</span>}
            </Button>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t px-5 py-4">
          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            {totals && totals.taxAmount !== 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <dt>{t("invoiceEditor.subtotal")}</dt>
                  <dd className="tabular-nums">{money(totals.amount, currency)}</dd>
                </div>
                {(totals.taxLines ?? [{ label: t("invoiceEditor.taxes"), rate: totals.taxRate, amount: totals.taxAmount }]).map((tl) => (
                  <div key={tl.label + tl.rate} className="flex justify-between text-muted-foreground">
                    <dt>{tl.label}{tl.rate > 0 && ` (${tl.rate} %)`}</dt>
                    <dd className="tabular-nums">{money(tl.amount, currency)}</dd>
                  </div>
                ))}
              </>
            )}
            <div className="flex justify-between font-semibold">
              <dt>{t("invoiceEditor.total")}</dt>
              <dd className="tabular-nums">{totals ? money(totals.totalAmount, currency) : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="inv-notes">{t("invoiceEditor.notes")}</Label>
        <Textarea
          id="inv-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("invoiceEditor.notesPlaceholder")}
          rows={3}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending || lines.length === 0}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {invoiceId ? t("invoiceEditor.save") : t("invoiceEditor.create")}
        </Button>
      </div>
    </div>
  );
}
