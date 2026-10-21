"use client";

import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/client";

/** Messages aren't watched continuously: where to call in an emergency. */
export function EmergencyNote({ region }: { region: string }) {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {region === "FR" ? t("inbox.emergencyFR") : t("inbox.emergencyCA")}
    </p>
  );
}
