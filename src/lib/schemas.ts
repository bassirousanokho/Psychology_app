import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const GENDERS = ["FEMALE", "MALE", "OTHER"] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
};

export const patientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || normalizePhone(v) !== null, "Invalid phone number"),
  dateOfBirth: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) <= new Date() && v >= "1900-01-01"),
      "Invalid date of birth",
    ),
  gender: z.enum(GENDERS).optional().or(z.literal("")),
  pronouns: z.string().trim().max(40, "Keep pronouns under 40 characters").optional(),
  backgroundNotes: z.string().optional(),
});

export const appointmentSchema = z
  .object({
    patientId: z.string().min(1, "Please select a patient"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
  })
  .refine(
    (d) => new Date(d.endTime) > new Date(d.startTime),
    { message: "End time must be after start time", path: ["endTime"] },
  );

export type PatientFormData = z.infer<typeof patientSchema>;
export type AppointmentFormData = z.infer<typeof appointmentSchema>;
