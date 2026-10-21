"use client";

import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings, exportPatientData, type SettingsFormData } from "@/app/(dashboard)/dashboard/settings/actions";
import { ChangeRateDialog } from "./change-rate-dialog";
import { REGIONS, REGION_CONFIG, type Region } from "@/lib/regions";
import { useI18n } from "@/i18n/client";

const schema = z.object({
  name: z.string().trim().min(1, "Practice name is required").max(120),
  region: z.enum(REGIONS),
  hourlyRateAdmin: z.number({ message: "Enter an amount" }).min(0, "Must be 0 or greater"),
  hourlyRateWriting: z.number({ message: "Enter an amount" }).min(0, "Must be 0 or greater"),
  cancellationNoticeHours: z.number({ message: "Enter a number" }).int().min(0).max(720, "At most 30 days"),
  cancellationAlertThreshold: z.number({ message: "Enter a number" }).int().min(1, "At least 1").max(50),
  retentionYears: z.number({ message: "Enter a number" }).int().min(1, "At least 1 year").max(50),
  taxRate: z.number().min(0).max(100),
  gstRate: z.number({ message: "Enter a rate" }).min(0).max(100),
  qstRate: z.number({ message: "Enter a rate" }).min(0).max(100),
  language: z.enum(["fr", "en"]),
  sessionRemindersEnabled: z.boolean(),
  currency: z.string().min(1),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  workingDays: z.array(z.number()).min(1, "Select at least one working day"),
}).refine((d) => d.workingHoursEnd > d.workingHoursStart, {
  message: "Day must end after it starts",
  path: ["workingHoursEnd"],
});

type FormValues = z.infer<typeof schema>;

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const; // ISO weekdays, labels from messages (day.1 … day.7)

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"];

interface SettingsFormProps {
  defaults: SettingsFormData;
  practiceRate: number;
}

export function SettingsForm({ defaults, practiceRate }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const { t, tError, money } = useI18n();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    const result = await exportPatientData();
    setExporting(false);
    if (!result.success) {
      toast.error(tError(result.error));
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("settings.exported"));
  }
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const workingDays = watch("workingDays");
  const region = watch("region");

  function toggleDay(day: number) {
    const current = workingDays ?? [];
    if (current.includes(day)) {
      setValue("workingDays", current.filter((d) => d !== day), { shouldValidate: true });
    } else {
      setValue("workingDays", [...current, day].sort(), { shouldValidate: true });
    }
  }

  async function onSubmit(data: FormValues) {
    setSaving(true);
    const result = await updateSettings(data);
    setSaving(false);
    if (result.success) {
      toast.success(t("settings.saved"));
    } else {
      toast.error(tError(result.error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* Billing */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">{t("settings.billing")}</h2>

        <div className="space-y-1.5">
          <Label htmlFor="name">{t("settings.name")}</Label>
          <Input id="name" {...register("name")} />
          <p className="text-xs text-muted-foreground">
            {t("settings.nameHint")}
          </p>
          {errors.name && <p className="text-xs text-destructive">{tError(errors.name.message)}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="region">{t("settings.region")}</Label>
          <select
            id="region"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("region", {
              // The currency follows the region; still editable below
              onChange: (e) => setValue("currency", REGION_CONFIG[e.target.value as Region].currency),
            })}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_CONFIG[r].label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t("settings.regionHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language">{t("settings.language")}</Label>
          <select
            id="language"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("language")}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {t("settings.languageHint")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{t("settings.rate")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.rateHint")}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tabular-nums">
              {money(practiceRate, watch("currency"))}
            </span>
            <ChangeRateDialog currentRate={practiceRate} currency={watch("currency")} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="hourlyRateAdmin"
            label={t("settings.hourlyAdmin")}
            step="0.01"
            register={register("hourlyRateAdmin", { valueAsNumber: true })}
            error={errors.hourlyRateAdmin?.message && tError(errors.hourlyRateAdmin.message)}
          />
          <NumberField
            id="hourlyRateWriting"
            label={t("settings.hourlyWriting")}
            step="0.01"
            register={register("hourlyRateWriting", { valueAsNumber: true })}
            error={errors.hourlyRateWriting?.message && tError(errors.hourlyRateWriting.message)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">

          {region === "CA-QC" ? (
            // Québec: GST and QST printed as separate lines; psychotherapy is exempt (0)
            <>
              <NumberField
                id="gstRate"
                label={t("settings.gst")}
                step="0.001"
                register={register("gstRate", { valueAsNumber: true })}
                error={errors.gstRate?.message && tError(errors.gstRate.message)}
              />
              <NumberField
                id="qstRate"
                label={t("settings.qst")}
                step="0.001"
                register={register("qstRate", { valueAsNumber: true })}
                error={errors.qstRate?.message && tError(errors.qstRate.message)}
              />
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="taxRate">{t("settings.taxRate")}</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("taxRate", { valueAsNumber: true })}
              />
              {errors.taxRate && (
                <p className="text-xs text-destructive">{tError(errors.taxRate.message)}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="currency">{t("settings.currency")}</Label>
            <select
              id="currency"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("currency")}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Availability */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">{t("settings.availability")}</h2>

        <div>
          <Label className="mb-2 block">{t("settings.workingDays")}</Label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((value) => {
              const active = (workingDays ?? []).includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background hover:bg-muted"
                  }`}
                >
                  {t(`day.${value}`)}
                </button>
              );
            })}
          </div>
          {errors.workingDays && (
            <p className="mt-1.5 text-xs text-destructive">{tError(errors.workingDays.message)}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workingHoursStart">{t("settings.dayStarts")}</Label>
            <Input
              id="workingHoursStart"
              type="time"
              {...register("workingHoursStart")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workingHoursEnd">{t("settings.dayEnds")}</Label>
            <Input
              id="workingHoursEnd"
              type="time"
              {...register("workingHoursEnd")}
            />
            {errors.workingHoursEnd && (
              <p className="text-xs text-destructive">{tError(errors.workingHoursEnd.message)}</p>
            )}
          </div>
        </div>
      </section>

      {/* Cancellations */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">{t("settings.cancellations")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="cancellationNoticeHours"
            label={t("settings.notice")}
            hint={t("settings.noticeHint")}
            register={register("cancellationNoticeHours", { valueAsNumber: true })}
            error={errors.cancellationNoticeHours?.message && tError(errors.cancellationNoticeHours.message)}
          />
          <NumberField
            id="cancellationAlertThreshold"
            label={t("settings.alertFrom")}
            hint={t("settings.alertHint")}
            register={register("cancellationAlertThreshold", { valueAsNumber: true })}
            error={errors.cancellationAlertThreshold?.message && tError(errors.cancellationAlertThreshold.message)}
          />
        </div>
      </section>

      {/* Patient reminders */}
      <section className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="font-semibold text-base">{t("settings.reminders")}</h2>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" {...register("sessionRemindersEnabled")} />
          <span>
            {t("settings.remindersLabel")}
            <span className="block text-xs text-muted-foreground">{t("settings.remindersHint")}</span>
          </span>
        </label>
      </section>

      {/* Data retention */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">{t("settings.retention")}</h2>
        <NumberField
          id="retentionYears"
          label={t("settings.retentionLabel")}
          hint={t("settings.retentionHint")}
          register={register("retentionYears", { valueAsNumber: true })}
          error={errors.retentionYears?.message && tError(errors.retentionYears.message)}
        />
      </section>

      <div className="flex items-center justify-between">
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {t("settings.export")}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.exportHint")}
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("settings.save")}
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  hint,
  step = "1",
  register,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  step?: string;
  register: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} min="0" {...register} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
