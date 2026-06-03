"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings, exportPatientData, type SettingsFormData } from "@/app/(dashboard)/dashboard/settings/actions";

const schema = z.object({
  defaultTariff: z.number().min(0),
  taxRate: z.number().min(0).max(100),
  currency: z.string().min(1),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  workingDays: z.array(z.number()),
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
}

export function SettingsForm({ defaults }: SettingsFormProps) {
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
      setValue("workingDays", current.filter((d) => d !== day));
    } else {
      setValue("workingDays", [...current, day].sort());
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="defaultTariff">Session tariff</Label>
            <Input
              id="defaultTariff"
              type="number"
              step="0.01"
              min="0"
              {...register("defaultTariff", { valueAsNumber: true })}
            />
            {errors.defaultTariff && (
              <p className="text-xs text-destructive">{errors.defaultTariff.message}</p>
            )}
          </div>

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
          </div>
        </div>
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
