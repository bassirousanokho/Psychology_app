"use client";

import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { GENDERS, patientSchemaFor, type PatientFormData } from "@/lib/schemas";
import { useI18n } from "@/i18n/client";
import { DEFAULT_REGION, regionConfig } from "@/lib/regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface PatientFormProps {
  defaultValues?: Partial<PatientFormData>;
  defaultTariffLabel?: string; // practice rate, shown as placeholder
  region?: string;              // practice region: phone format and placeholders
  onSubmit: (data: PatientFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function PatientForm({
  defaultValues,
  defaultTariffLabel,
  region = DEFAULT_REGION,
  onSubmit,
  onCancel,
  isSubmitting,
}: PatientFormProps) {
  const cfg = regionConfig(region);
  const { t } = useI18n();
  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientSchemaFor(cfg.phoneCountry)),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      gender: "",
      pronouns: "",
      address: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      emergencyContactRelation: "",
      doctorName: "",
      doctorPhone: "",
      tariff: "",
      remindersEnabled: true,
      backgroundNotes: "",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.firstName")}</FormLabel>
                <FormControl>
                  <Input placeholder="Marie" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.lastName")}</FormLabel>
                <FormControl>
                  <Input placeholder="Dupont" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.email")}</FormLabel>
              <FormControl>
                <Input type="email" placeholder="marie@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.phone")}</FormLabel>
              <FormControl>
                <Input type="tel" placeholder={cfg.phonePlaceholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.dateOfBirth")}</FormLabel>
                <FormControl>
                  <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.gender")}</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">—</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>{t(`gender.${g}`)}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pronouns"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.pronouns")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("form.pronounsPlaceholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.address")}</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder={cfg.addressPlaceholder}
                  className="resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t("form.addressHint")}</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{t("form.emergency")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField form={form} name="emergencyContactName" label={t("form.fullName")} />
            <TextField form={form} name="emergencyContactRelation" label={t("form.relationship")} placeholder={t("form.relationshipPlaceholder")} />
          </div>
          <TextField form={form} name="emergencyContactPhone" label={t("form.phone")} type="tel" placeholder={cfg.phonePlaceholder} />
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{t("form.doctor")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField form={form} name="doctorName" label={t("form.fullName")} placeholder={t("form.doctorPlaceholder")} />
            <TextField form={form} name="doctorPhone" label={t("form.phone")} type="tel" placeholder={cfg.phonePlaceholder} />
          </div>
        </fieldset>

        <TextField
          form={form}
          name="tariff"
          label={t("form.rate")}
          type="number"
          placeholder={defaultTariffLabel ? t("form.ratePlaceholder", { rate: defaultTariffLabel }) : t("form.ratePlaceholderPlain")}
          description={t("form.rateHint")}
        />

        <FormField
          control={form.control}
          name="remindersEnabled"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={field.value ?? true}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                {t("form.reminders")}
              </label>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="backgroundNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.background")}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t("form.backgroundPlaceholder")}
                  className="min-h-24 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("form.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function TextField({
  form,
  name,
  label,
  type = "text",
  placeholder,
  description,
}: {
  form: UseFormReturn<PatientFormData>;
  name: Exclude<keyof PatientFormData, "remindersEnabled">; // text fields only
  label: string;
  type?: string;
  placeholder?: string;
  description?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              step={type === "number" ? "0.01" : undefined}
              min={type === "number" ? "0" : undefined}
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
