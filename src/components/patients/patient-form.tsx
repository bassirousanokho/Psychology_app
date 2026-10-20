"use client";

import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { GENDERS, GENDER_LABELS, patientSchemaFor, type PatientFormData } from "@/lib/schemas";
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
                <FormLabel>First name *</FormLabel>
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
                <FormLabel>Last name *</FormLabel>
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
              <FormLabel>Email</FormLabel>
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
              <FormLabel>Phone</FormLabel>
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
                <FormLabel>Date of birth</FormLabel>
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
                <FormLabel>Gender</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">—</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>{GENDER_LABELS[g]}</option>
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
                <FormLabel>Pronouns</FormLabel>
                <FormControl>
                  <Input placeholder="elle, il, iel…" {...field} />
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
              <FormLabel>Postal address</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder={cfg.addressPlaceholder}
                  className="resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">Printed on invoices.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Emergency contact</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField form={form} name="emergencyContactName" label="Full name" />
            <TextField form={form} name="emergencyContactRelation" label="Relationship" placeholder="Mother, partner…" />
          </div>
          <TextField form={form} name="emergencyContactPhone" label="Phone" type="tel" placeholder={cfg.phonePlaceholder} />
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Family doctor</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField form={form} name="doctorName" label="Full name" placeholder="Dr Marie Leroy" />
            <TextField form={form} name="doctorPhone" label="Phone" type="tel" placeholder={cfg.phonePlaceholder} />
          </div>
        </fieldset>

        <TextField
          form={form}
          name="tariff"
          label="Individual session rate"
          type="number"
          placeholder={defaultTariffLabel ? `Practice rate (${defaultTariffLabel})` : "Practice rate"}
          description="Leave empty to use the practice rate. To change it from a later date with a reminder, use “Schedule rate change” on the patient file."
        />

        <FormField
          control={form.control}
          name="backgroundNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Background notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="General context, referral source, initial presentation…"
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
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save patient
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
  name: keyof PatientFormData;
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
