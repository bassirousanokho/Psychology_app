"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { verifyLink } from "@/app/inbox/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";

/** First three letters of the last name + date of birth, to open the private inbox. */
export function LinkCheck({ token, locked }: { token: string; locked: boolean }) {
  const router = useRouter();
  const { t, tError } = useI18n();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(locked ? t("inbox.locked") : null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await verifyLink(token, name, dob);
      if (r.success) router.refresh();
      else setError(tError(r.error));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 py-2">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        {t("inbox.checkHint")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ln">{t("inbox.checkName")}</Label>
          <Input id="ln" value={name} maxLength={3} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder="ABC" className="uppercase tracking-widest" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">{t("inbox.checkDob")}</Label>
          <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={isPending || name.trim().length < 1 || !dob}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("inbox.checkSubmit")}
      </Button>
    </form>
  );
}
