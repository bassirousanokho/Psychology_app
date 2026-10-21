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
import { T, useI18n } from "@/i18n/client";

// ── Row actions cell ──────────────────────────────────────────────────────────

function PatientRowActions({
  patient,
  defaultTariffLabel,
  region,
}: {
  patient: PatientRow;
  defaultTariffLabel?: string;
  region?: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { t, tError } = useI18n();

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePatient(patient.id);
      if (result.success) {
        toast.success(t("patients.deleted"));
      } else {
        toast.error(tError(result.error));
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
          <span className="sr-only">{t("patients.actions")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Base UI requires group labels to sit inside a group, or the menu crashes on open */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("patients.actions")}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/dashboard/patients/${patient.id}`)}>
            <User className="mr-2 h-4 w-4" />
            {t("patients.viewProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("patients.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("patients.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditPatientSheet
        patient={patient}
        defaultTariffLabel={defaultTariffLabel}
        region={region}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("patients.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("patients.deleteBody", { name: `${patient.firstName} ${patient.lastName}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              {t("patients.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function DateCell({ date }: { date: Date }) {
  const { fmt } = useI18n();
  return <>{fmt(date, "d MMM yyyy")}</>;
}

/** Accent- and case-insensitive text sort; empty values always last. */
const textSort: SortingFn<PatientRow> = (a, b, columnId) =>
  collator.compare(a.getValue<string>(columnId) ?? "", b.getValue<string>(columnId) ?? "");

export const patientColumns: ColumnDef<PatientRow>[] = [
  {
    accessorFn: (row) => `${row.lastName} ${row.firstName}`,
    id: "name",
    header: () => <T k="patients.col.name" />,
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
    header: () => <T k="patients.col.email" />,
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
    header: () => <T k="patients.col.phone" />,
    sortingFn: textSort,
    sortUndefined: "last",
    cell: ({ getValue }) =>
      getValue<string | undefined>() ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorFn: (row) => row.createdAt,
    id: "since",
    header: () => <T k="patients.col.since" />,
    sortingFn: "datetime",
    cell: ({ getValue }) => <DateCell date={getValue<Date>()} />,
  },
  {
    id: "actions",
    enableSorting: false,
    cell: ({ row, table }) => (
      <PatientRowActions
        patient={row.original}
        {...(table.options.meta as { defaultTariffLabel?: string; region?: string } | undefined)}
      />
    ),
  },
];
