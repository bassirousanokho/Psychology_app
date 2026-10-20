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

const schema = z.object({
  hourlyRateAdmin: z.number({ message: "Enter an amount" }).min(0, "Must be 0 or greater"),
  hourlyRateWriting: z.number({ message: "Enter an amount" }).min(0, "Must be 0 or greater"),
  cancellationNoticeHours: z.number({ message: "Enter a number" }).int().min(0).max(720, "At most 30 days"),
  cancellationAlertThreshold: z.number({ message: "Enter a number" }).int().min(1, "At least 1").max(50),
  retentionYears: z.number({ message: "Enter a number" }).int().min(1, "At least 1 year").max(50),
  taxRate: z.number().min(0).max(100),
  currency: z.string().min(1),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  workingDays: z.array(z.number()).min(1, "Select at least one working day"),
}).refine((d) => d.workingHoursEnd > d.workingHoursStart, {
  message: "Day must end after it starts",
  path: ["workingHoursEnd"],
});

type FormValues = z.infer<typeof schema>;

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 7 },
];

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"];

interface SettingsFormProps {
  defaults: SettingsFormData;
  practiceRate: number;
}

export function SettingsForm({ defaults, practiceRate }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    const result = await exportPatientData();
    setExporting(false);
    if (!result.success) {
      toast.error(result.error ?? "Export failed");
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
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
      toast.success("Settings saved");
    } else {
      toast.error(result.error ?? "Failed to save settings");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* Billing */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">Billing defaults</h2>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Psychotherapy session rate</p>
            <p className="text-xs text-muted-foreground">
              Practice rate for new patients. Patients can have their own rate (patient file).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tabular-nums">
              {practiceRate.toFixed(2)} {watch("currency")}
            </span>
            <ChangeRateDialog currentRate={practiceRate} currency={watch("currency")} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="hourlyRateAdmin"
            label="Administrative work (per hour)"
            step="0.01"
            register={register("hourlyRateAdmin", { valueAsNumber: true })}
            error={errors.hourlyRateAdmin?.message}
          />
          <NumberField
            id="hourlyRateWriting"
            label="Report writing (per hour)"
            step="0.01"
            register={register("hourlyRateWriting", { valueAsNumber: true })}
            error={errors.hourlyRateWriting?.message}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">

          <div className="space-y-1.5">
            <Label htmlFor="taxRate">Tax rate (%)</Label>
            <Input
              id="taxRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              {...register("taxRate", { valueAsNumber: true })}
            />
            {errors.taxRate && (
              <p className="text-xs text-destructive">{errors.taxRate.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
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
        <h2 className="font-semibold text-base">Availability</h2>

        <div>
          <Label className="mb-2 block">Working days</Label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(({ label, value }) => {
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
                  {label}
                </button>
              );
            })}
          </div>
          {errors.workingDays && (
            <p className="mt-1.5 text-xs text-destructive">{errors.workingDays.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workingHoursStart">Day starts at</Label>
            <Input
              id="workingHoursStart"
              type="time"
              {...register("workingHoursStart")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workingHoursEnd">Day ends at</Label>
            <Input
              id="workingHoursEnd"
              type="time"
              {...register("workingHoursEnd")}
            />
            {errors.workingHoursEnd && (
              <p className="text-xs text-destructive">{errors.workingHoursEnd.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* Cancellations */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">Cancellations</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="cancellationNoticeHours"
            label="Notice period (hours)"
            hint="Shown when cancelling; you decide whether a fee applies."
            register={register("cancellationNoticeHours", { valueAsNumber: true })}
            error={errors.cancellationNoticeHours?.message}
          />
          <NumberField
            id="cancellationAlertThreshold"
            label="Alert from (cancellations / 30 days)"
            hint="A patient reaching this many cancellations in 30 days is flagged."
            register={register("cancellationAlertThreshold", { valueAsNumber: true })}
            error={errors.cancellationAlertThreshold?.message}
          />
        </div>
      </section>

      {/* Data retention */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-base">Data retention</h2>
        <NumberField
          id="retentionYears"
          label="Remind me to review patients after (years)"
          hint="Patients with no session for this long, and patients in Recently deleted for this long, appear in your reminders."
          register={register("retentionYears", { valueAsNumber: true })}
          error={errors.retentionYears?.message}
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
            Export patient data (JSON)
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Downloads all patient records for data portability (GDPR Art. 20).
            Session notes are excluded.
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
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
