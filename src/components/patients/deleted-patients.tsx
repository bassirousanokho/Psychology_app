"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { purgePatient, restorePatient } from "@/app/(dashboard)/dashboard/patients/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
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
  const { t, tp, tError, fmt } = useI18n();

  function run(id: string, action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.success) toast.success(ok);
      else toast.error(tError(result.error));
    });
  }

  if (patients.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("deleted.empty")}
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
                {t("deleted.on", { date: fmt(p.deletedAt, "d MMM yyyy, HH:mm") })}
                {p.invoiceCount > 0 && ` · ${tp(p.invoiceCount, "deleted.invoicesKept")}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === p.id}
              onClick={() => run(p.id, () => restorePatient(p.id), t("deleted.restored"))}
            >
              {busyId === p.id ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("deleted.restore")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busyId === p.id || p.invoiceCount > 0}
              title={p.invoiceCount > 0 ? t("deleted.purgeBlocked") : undefined}
              onClick={() => setPurgeTarget(p)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("deleted.purge")}
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleted.purgeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleted.purgeBody", { name: `${purgeTarget?.firstName ?? ""} ${purgeTarget?.lastName ?? ""}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = purgeTarget!;
                setPurgeTarget(null);
                run(target.id, () => purgePatient(target.id), t("deleted.purged"));
              }}
            >
              {t("deleted.purge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
