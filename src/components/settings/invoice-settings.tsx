"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  confirmBrandingUpload,
  createBrandingUploadUrl,
  removeBranding,
  updateInvoiceDetails,
  type InvoiceDetailsData,
} from "@/app/(dashboard)/dashboard/settings/invoice-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { missingLegalDetails } from "@/lib/invoice-legal";
import { regionConfig } from "@/lib/regions";
import { useI18n } from "@/i18n/client";

type Details = Required<{ [K in keyof InvoiceDetailsData]: string }>;

export function InvoiceSettings({
  region,
  defaults,
  workspaceName,
  headerUrl,
  footerUrl,
}: {
  region: string;
  defaults: Details;
  workspaceName: string;
  headerUrl: string | null;
  footerUrl: string | null;
}) {
  const [d, setD] = useState<Details>(defaults);
  const [isPending, startTransition] = useTransition();
  const cfg = regionConfig(region);
  const missing = missingLegalDetails({ ...d, region });
  const { t, tError } = useI18n();

  function field(key: keyof Details) {
    return {
      id: `inv-${key}`,
      value: d[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setD((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateInvoiceDetails(d);
      if (result.success) toast.success(t("invoiceSettings.saved"));
      else toast.error(tError(result.error));
    });
  }

  return (
    <section className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-base">{t("invoiceSettings.title")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(region === "FR" ? "invoiceSettings.hintFR" : "invoiceSettings.hintQC", { region: cfg.label })}
        </p>
      </div>

      {missing.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t("invoiceSettings.missing")}</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {missing.map((m) => (
                <li key={m}>{t(m)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          {t("invoiceSettings.complete")}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-practitionerName">{t("invoiceSettings.nameAsPrinted")}</Label>
          <Input placeholder={workspaceName} {...field("practitionerName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-professionalTitle">{t("invoiceSettings.title2")}</Label>
          <Input placeholder="Psychologue" {...field("professionalTitle")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-address">{t("invoiceSettings.address")}</Label>
        <Textarea rows={3} placeholder={cfg.addressPlaceholder} className="resize-none" {...field("address")} />
      </div>

      {/* Registration numbers for this region */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cfg.legalFields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`inv-${f.key}`}>
              {t(`legalField.${f.key}`)}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            <Input placeholder={f.placeholder} {...field(f.key)} />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-vatMention">{t("invoiceSettings.taxMention")}</Label>
        <Input placeholder={cfg.taxMention} {...field("vatMention")} />
        <p className="text-xs text-muted-foreground">
          {t(region === "FR" ? "invoiceSettings.taxHintFR" : "invoiceSettings.taxHintQC")}{" "}
          {t("invoiceSettings.accountant")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-paymentTerms">{t("invoiceSettings.paymentTerms")}</Label>
        <Input {...field("paymentTerms")} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-invoiceNotes">{t("invoiceSettings.otherMentions")}</Label>
        <Textarea rows={2} className="resize-none" placeholder="Membre d'une association agréée, acceptant à ce titre le règlement par chèque…" {...field("invoiceNotes")} />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("invoiceSettings.save")}
        </Button>
      </div>

      <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
        <BrandingSlot kind="header" label={t("invoiceSettings.header")} url={headerUrl} hint={t("invoiceSettings.headerHint")} />
        <BrandingSlot kind="footer" label={t("invoiceSettings.footer")} url={footerUrl} hint={t("invoiceSettings.footerHint")} />
      </div>
    </section>
  );
}

function BrandingSlot({
  kind,
  label,
  url,
  hint,
}: {
  kind: "header" | "footer";
  label: string;
  url: string | null;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { t, tError } = useI18n();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await createBrandingUploadUrl({ kind, fileType: file.type, fileSize: file.size });
      if (!prepared.success) {
        toast.error(tError(prepared.error));
        return;
      }
      const put = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        toast.error(t("invoiceSettings.uploadFailed"));
        return;
      }
      const saved = await confirmBrandingUpload(kind, prepared.key);
      if (saved.success) toast.success(t("invoiceSettings.updated", { label }));
      else toast.error(tError(saved.error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    const result = await removeBranding(kind);
    setBusy(false);
    if (result.success) toast.success(t("invoiceSettings.removed", { label }));
    else toast.error(tError(result.error));
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed GCS URL
          <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">{t("invoiceSettings.noImage")}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint} {t("invoiceSettings.imageRules")}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
          {url ? t("invoiceSettings.replace") : t("invoiceSettings.upload")}
        </Button>
        {url && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={handleRemove}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {t("invoiceSettings.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}
