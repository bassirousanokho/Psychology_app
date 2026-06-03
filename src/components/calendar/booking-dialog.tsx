"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { appointmentSchema, type AppointmentFormData } from "@/lib/schemas";
import { createAppointment } from "@/app/(dashboard)/dashboard/calendar/actions";
import type { PatientOption } from "./patient-combobox";
import { PatientCombobox } from "./patient-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface BookingDialogProps {
  patients: PatientOption[];
  // Pre-fill start/end when the user clicks an empty time slot
  initialStart?: Date;
  initialEnd?: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookingDialog({
  patients,
  initialStart,
  initialEnd,
  open,
  onOpenChange,
}: BookingDialogProps) {
  const [isPending, startTransition] = useTransition();

  const toDatetimeLocal = (d?: Date) =>
    d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patientId: "",
      startTime: toDatetimeLocal(initialStart),
      endTime: toDatetimeLocal(initialEnd),
    },
  });

  // Reset form when dialog opens with new initial values
  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      form.reset({
        patientId: "",
        startTime: toDatetimeLocal(initialStart),
        endTime: toDatetimeLocal(initialEnd),
      });
    }
    onOpenChange(isOpen);
  }

  function onSubmit(data: AppointmentFormData) {
    startTransition(async () => {
      const result = await createAppointment(data);
      if (result.success) {
        toast.success("Appointment booked");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>
            Select a patient and set the start and end times.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="patientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Patient *</FormLabel>
                  <FormControl>
                    <PatientCombobox
                      patients={patients}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Book appointment
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Trigger button (standalone) ───────────────────────────────────────────────

export function BookAppointmentButton({ patients }: { patients: PatientOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus className="mr-2 h-4 w-4" />
        Book appointment
      </Button>
      <BookingDialog patients={patients} open={open} onOpenChange={setOpen} />
    </>
  );
}
