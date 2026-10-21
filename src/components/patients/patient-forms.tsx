"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, Copy, Loader2, Send, X } from "lucide-react";
import { cancelFormRequest, sendFormToPatient } from "@/app/(dashboard)/dashboard/forms/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/client";

export type FormRequestRow = {
  id: string;
  name: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  token: string;
  signed: boolean;
  createdAt: string;
  completedAt: string | null;
};

const VARIANTS = { PENDING: "secondary", COMPLETED: "default", CANCELLED: "outline" } as const;

export function PatientForms({
  patientId,
  templates,
  requests,
  disabled,
}: {
  patientId: string;
  templates: { id: string; name: string }[];
  requests: FormRequestRow[];
  disabled: boolean; // patient in Recently deleted
}) {
  const { t, fmt, tError } = useI18n();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/form/${token}`);
      toast.success(t("patientForms.copied"));
    } catch {
      toast.error(tError("Something went wrong"));
    }
  }

  function send() {
    if (!templateId) return;
    startTransition(async () => {
      const result = await sendFormToPatient(patientId, templateId);
      if (!result.success) return void toast.error(tError(result.error));
      if (result.emailed) toast.success(t("patientForms.sent"));
      else {
        // No email provider or no address: the practitioner can share the link
        toast.success(t("patientForms.createdNoEmail"));
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${result.path}`);
        } catch {
          /* clipboard may be unavailable */
        }
      }
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          {t("patientForms.title")}
        </h2>
        {!disabled &&
          (templates.length === 0 ? (
            <Link href="/dashboard/forms" className="text-xs text-muted-foreground underline underline-offset-2">
              {t("patientForms.setUp")}
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                aria-label={t("patientForms.choose")}
                className="h-8 max-w-52 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
              <Button size="sm" onClick={send} disabled={isPending}>
                {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                {t("patientForms.send")}
              </Button>
            </div>
          ))}
      </div>
      {requests.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t("patientForms.empty")}</p>
      ) : (
        <ul className="divide-y">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("patientForms.sentOn", { date: fmt(r.createdAt, "d MMM yyyy") })}
                  {r.completedAt && ` · ${t("patientForms.completedOn", { date: fmt(r.completedAt, "d MMM yyyy") })}`}
                  {r.signed && ` · ${t("patientForms.signed")}`}
                </p>
              </div>
              <Badge variant={VARIANTS[r.status]}>{t(`formStatus.${r.status}`)}</Badge>
              {r.status === "COMPLETED" && (
                <Button variant="outline" size="sm" className="h-7 text-xs" render={<Link href={`/dashboard/forms/responses/${r.id}`} />}>
                  {t("patientForms.view")}
                </Button>
              )}
              {r.status === "PENDING" && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copyLink(r.token)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {t("patientForms.copyLink")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    title={t("patientForms.withdraw")}
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await cancelFormRequest(r.id);
                        if (result.success) toast.success(t("patientForms.withdrawn"));
                        else toast.error(tError(result.error));
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
