"use client";

import { useRouter } from "next/navigation";
import { PatientCombobox, type PatientOption } from "@/components/calendar/patient-combobox";
import { useI18n } from "@/i18n/client";

/** Pick a patient to open (or start) their conversation. */
export function NewConversation({ patients }: { patients: PatientOption[] }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <PatientCombobox
      patients={patients}
      value=""
      onChange={(id) => id && router.push(`/dashboard/inbox/${id}`)}
      placeholder={t("inbox.newConversation")}
    />
  );
}
