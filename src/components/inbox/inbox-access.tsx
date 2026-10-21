"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { KeyRound, Link2, RotateCcw, ShieldAlert, UserCheck } from "lucide-react";
import { resetInboxLink } from "@/app/(dashboard)/dashboard/inbox/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/** How the patient reads messages, and the private link tools. */
export function InboxAccess({
  patientId,
  mode,
  hasEmail,
  hasLink,
}: {
  patientId: string;
  mode: "portal" | "link" | "none";
  hasEmail: boolean;
  hasLink: boolean;
}) {
  const { t, tError } = useI18n();
  const [isPending, startTransition] = useTransition();

  if (mode === "portal") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5" />
        {t("inbox.access.portal")}
      </span>
    );
  }
  if (mode === "none") {
    return (
      <Link href={`/dashboard/patients/${patientId}`} className="flex items-center gap-1.5 text-xs text-amber-700 hover:underline dark:text-amber-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        {t("inbox.access.none")}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t("inbox.access.linkHint")}>
        <KeyRound className="h-3.5 w-3.5" />
        {t("inbox.access.link")}
        {!hasEmail && ` · ${t("inbox.access.noEmail")}`}
      </span>
      {hasLink && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={t("inbox.access.reset")}
          disabled={isPending}
          onClick={() => {
            if (!window.confirm(t("inbox.access.resetConfirm"))) return;
            startTransition(async () => {
              const r = await resetInboxLink(patientId);
              if (r.success) toast.success(t("inbox.access.resetDone"));
              else toast.error(tError(r.error));
            });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
      {!hasLink && <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("inbox.access.linkOnFirst")} />}
    </div>
  );
}
