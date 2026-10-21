import { z } from "zod";
import type { CountryCode } from "libphonenumber-js/min";
import { normalizePhone } from "@/lib/phone";
import { DEFAULT_REGION, REGION_CONFIG } from "@/lib/regions";
import { SESSION_TYPES } from "@/lib/session-types";

const DEFAULT_PHONE_COUNTRY = REGION_CONFIG[DEFAULT_REGION].phoneCountry;

export const GENDERS = ["FEMALE", "MALE", "OTHER"] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
};

/** Patient form schema; phones typed without a country code are read in `country`. */
export function patientSchemaFor(country: CountryCode) {
  const optionalPhone = z
    .string()
    .optional()
    .refine((v) => !v?.trim() || normalizePhone(v, country) !== null, "Invalid phone number");

  return z.object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .optional()
      .or(z.literal("")),
    phone: optionalPhone,
    dateOfBirth: z
      .string()
      .optional()
      .refine(
        (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) <= new Date() && v >= "1900-01-01"),
        "Invalid date of birth",
      ),
    gender: z.enum(GENDERS).optional().or(z.literal("")),
    pronouns: z.string().trim().max(40, "Keep pronouns under 40 characters").optional(),
    address: z.string().trim().max(500).optional(),
    emergencyContactName: z.string().trim().optional(),
    emergencyContactPhone: optionalPhone,
    emergencyContactRelation: z.string().trim().optional(),
    doctorName: z.string().trim().optional(),
    doctorPhone: optionalPhone,
    // Empty = practice default rate
    tariff: z
      .string()
      .optional()
      .refine((v) => !v?.trim() || (!isNaN(Number(v)) && Number(v) >= 0), "Enter a valid amount"),
    backgroundNotes: z.string().optional(),
    remindersEnabled: z.boolean().optional(),
  });
}

export const patientSchema = patientSchemaFor(DEFAULT_PHONE_COUNTRY);

export const appointmentSchema = z
  .object({
    patientId: z.string().min(1, "Please select a patient"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    type: z.enum(SESSION_TYPES).default("PSYCHOTHERAPY"),
  })
  .refine(
    (d) => new Date(d.endTime) > new Date(d.startTime),
    { message: "End time must be after start time", path: ["endTime"] },
  );

export type PatientFormData = z.infer<typeof patientSchema>;
export type AppointmentFormData = z.input<typeof appointmentSchema>;
