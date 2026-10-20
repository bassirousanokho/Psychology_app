"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, SortingFn } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import type { PatientRow } from "./types";
import { deletePatient } from "@/app/(dashboard)/dashboard/patients/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditPatientSheet } from "./patient-sheet";
import { formatPhone } from "@/lib/phone";

// ── Row actions cell ──────────────────────────────────────────────────────────

function PatientRowActions({
  patient,
  defaultTariffLabel,
}: {
  patient: PatientRow;
  defaultTariffLabel?: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePatient(patient.id);
      if (result.success) {
        toast.success("Patient deleted");
      } else {
        toast.error(result.error);
      }
      setDeleteOpen(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Base UI requires group labels to sit inside a group, or the menu crashes on open */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/dashboard/patients/${patient.id}`)}>
            <User className="mr-2 h-4 w-4" />
            View profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditPatientSheet
        patient={patient}
        defaultTariffLabel={defaultTariffLabel}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete patient?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>
                {patient.firstName} {patient.lastName}
              </strong>{" "}
              moves to Recently deleted: history and invoices are kept, upcoming sessions are
              cancelled and portal access stops. You can restore them from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Accent- and case-insensitive text sort; empty values always last. */
const textSort: SortingFn<PatientRow> = (a, b, columnId) =>
  collator.compare(a.getValue<string>(columnId) ?? "", b.getValue<string>(columnId) ?? "");

export const patientColumns: ColumnDef<PatientRow>[] = [
  {
    accessorFn: (row) => `${row.lastName} ${row.firstName}`,
    id: "name",
    header: "Name",
    sortingFn: textSort,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.lastName}, {row.original.firstName}
      </span>
    ),
  },
  {
    // undefined (not null) so sortUndefined can push empty emails to the bottom
    accessorFn: (row) => row.email ?? undefined,
    id: "email",
    header: "Email",
    sortingFn: textSort,
    sortUndefined: "last",
    cell: ({ getValue }) => {
      const email = getValue<string | undefined>();
      return email ? (
        <a href={`mailto:${email}`} className="text-primary hover:underline">
          {email}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorFn: (row) => formatPhone(row.phone) ?? undefined,
    id: "phone",
    header: "Phone",
    sortingFn: textSort,
    sortUndefined: "last",
    cell: ({ getValue }) =>
      getValue<string | undefined>() ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorFn: (row) => row.createdAt,
    id: "since",
    header: "Patient since",
    sortingFn: "datetime",
    cell: ({ getValue }) =>
      new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
        getValue<Date>(),
      ),
  },
  {
    id: "actions",
    enableSorting: false,
    cell: ({ row, table }) => (
      <PatientRowActions
        patient={row.original}
        defaultTariffLabel={(table.options.meta as { defaultTariffLabel?: string } | undefined)?.defaultTariffLabel}
      />
    ),
  },
];
