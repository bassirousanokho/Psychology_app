import { z } from "zod";

export const patientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
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
