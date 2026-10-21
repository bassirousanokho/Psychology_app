"use client";

import { useState, useTransition } from "react";
import { format, startOfYear, endOfYear, subYears } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, Loader2, Mail } from "lucide-react";
import { createStatement } from "@/app/(dashboard)/dashboard/patients/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** Statement of payments over a period, for insurance claims. */
export function StatementCard({ patientId, patientHasEmail }: { patientId: string; patientHasEmail: boolean }) {
  const { t, tError } = useI18n();
  const now = new Date();
  const presets = {
    thisYear: { label: t("statement.thisYear", { year: now.getFullYear() }), from: ymd(startOfYear(now)), to: ymd(now) },
    lastYear: {
      label: t("statement.lastYear", { year: now.getFullYear() - 1 }),
      from: ymd(startOfYear(subYears(now, 1))),
      to: ymd(endOfYear(subYears(now, 1))),
    },
  };
  const [from, setFrom] = useState(presets.thisYear.from);
  const [to, setTo] = useState(presets.thisYear.to);
  const [isPending, startTransition] = useTransition();
  const valid = !!from && !!to && from <= to;

  function view() {
    // Open the tab now (inside the click) so the browser doesn't block it
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const result = await createStatement({ patientId, periodStart: from, periodEnd: to, send: false });
      if (result.success) {
        if (tab) tab.location.href = result.path;
        else window.location.href = result.path;
      } else {
        tab?.close();
        toast.error(tError(result.error));
      }
    });
  }

  function email() {
    startTransition(async () => {
      const result = await createStatement({ patientId, periodStart: from, periodEnd: to, send: true });
      if (result.success) toast.success(t("statement.emailed"));
      else toast.error(tError(result.error));
    });
  }

  return (
    <div className="rounded-xl border bg-card px-5 py-4 space-y-3">
      <div>
        <h2 className="font-semibold">{t("statement.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("statement.hint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.values(presets).map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant={from === p.from && to === p.to ? "default" : "outline"}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="stmt-from" className="text-xs">{t("common.from")}</Label>
          <Input id="stmt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stmt-to" className="text-xs">{t("common.to")}</Label>
          <Input id="stmt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Button type="button" variant="outline" disabled={!valid || isPending} onClick={view}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
          {t("statement.view")}
        </Button>
        <Button
          type="button"
          disabled={!valid || isPending || !patientHasEmail}
          title={patientHasEmail ? undefined : t("common.noEmailHint")}
          onClick={email}
        >
          <Mail className="mr-2 h-4 w-4" />
          {t("statement.email")}
        </Button>
      </div>
    </div>
  );
}
