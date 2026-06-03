"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Patient } from "@/generated/prisma/client";
import { createPatient, updatePatient } from "@/app/(dashboard)/dashboard/patients/actions";
import type { PatientFormData } from "@/lib/schemas";
import { PatientForm } from "./patient-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

// ── Create button + sheet ─────────────────────────────────────────────────────

export function CreatePatientButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(data: PatientFormData) {
    startTransition(async () => {
      const result = await createPatient(data);
      if (result.success) {
        toast.success("Patient created");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        New patient
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New patient</SheetTitle>
            <SheetDescription>
              Add a new patient to your workspace.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PatientForm
              onSubmit={handleSubmit}
              onCancel={() => setOpen(false)}
              isSubmitting={isPending}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Edit sheet ────────────────────────────────────────────────────────────────

interface EditPatientSheetProps {
  patient: Patient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPatientSheet({ patient, open, onOpenChange }: EditPatientSheetProps) {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(data: PatientFormData) {
    startTransition(async () => {
      const result = await updatePatient(patient.id, data);
      if (result.success) {
        toast.success("Patient updated");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit patient</SheetTitle>
          <SheetDescription>
            Update {patient.firstName} {patient.lastName}&apos;s record.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <PatientForm
            defaultValues={{
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: patient.email ?? "",
              phone: patient.phone ?? "",
              backgroundNotes: patient.backgroundNotes ?? "",
            }}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isPending}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
