"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { purgePatient, restorePatient } from "@/app/(dashboard)/dashboard/patients/actions";
import { Button } from "@/components/ui/button";
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

export type DeletedPatient = {
  id: string;
  firstName: string;
  lastName: string;
  deletedAt: string; // ISO
  invoiceCount: number;
};

export function DeletedPatients({ patients }: { patients: DeletedPatient[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedPatient | null>(null);
  const [, startTransition] = useTransition();

  function run(id: string, action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.success) toast.success(ok);
      else toast.error(result.error ?? "Something went wrong");
    });
  }

  if (patients.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        No recently deleted patients.
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-lg border bg-card">
        {patients.map((p) => (
          <li key={p.id} className="flex items-center gap-4 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">
                {p.lastName}, {p.firstName}
              </p>
              <p className="text-xs text-muted-foreground">
                Deleted {format(new Date(p.deletedAt), "d MMM yyyy 'at' HH:mm")}
                {p.invoiceCount > 0 &&
                  ` · ${p.invoiceCount} invoice${p.invoiceCount !== 1 ? "s" : ""} kept`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === p.id}
              onClick={() => run(p.id, () => restorePatient(p.id), "Patient restored")}
            >
              {busyId === p.id ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Restore
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busyId === p.id || p.invoiceCount > 0}
              title={p.invoiceCount > 0 ? "Invoices must be kept for 10 years" : undefined}
              onClick={() => setPurgeTarget(p)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete permanently
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>
                {purgeTarget?.firstName} {purgeTarget?.lastName}
              </strong>
              , their sessions, session notes and documents will be erased for good. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = purgeTarget!;
                setPurgeTarget(null);
                run(target.id, () => purgePatient(target.id), "Patient permanently deleted");
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
