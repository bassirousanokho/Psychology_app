"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Mail, Send } from "lucide-react";
import { sendPatientMessageAction } from "@/app/(dashboard)/dashboard/patients/[id]/actions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MessageItem = {
  id: string;
  subject: string;
  body: string; // decrypted on the server
  toEmail: string;
  status: "SENT" | "FAILED" | "NOT_CONFIGURED";
  error: string | null;
  createdAt: string; // ISO
};

const STATUS_VARIANT: Record<MessageItem["status"], "default" | "outline" | "destructive"> = {
  SENT: "default",
  NOT_CONFIGURED: "outline",
  FAILED: "destructive",
};

export function PatientMessages({
  patientId,
  patientName,
  patientEmail,
  messages,
  disabledReason,
}: {
  patientId: string;
  patientName: string;
  patientEmail: string | null;
  messages: MessageItem[]; // newest first
  disabledReason: string | null; // why writing is unavailable (no email, deleted patient)
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { t, fmt } = useI18n();

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <h2 className="font-semibold">{t("messages.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {disabledReason ?? t("messages.hint", { email: patientEmail ?? "" })}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!!disabledReason} onClick={() => setOpen(true)}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          {t("messages.write")}
        </Button>
      </div>

      {messages.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t("messages.empty")}</p>
      ) : (
        <ul className="divide-y">
          {messages.map((m) => {
            const isOpen = expanded === m.id;
            return (
              <li key={m.id} className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate text-sm font-medium">{m.subject}</span>
                  <Badge variant={STATUS_VARIANT[m.status]}>{t(`messages.status.${m.status}`)}</Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmt(m.createdAt, "d MMM yyyy, HH:mm")}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 ml-7 space-y-1.5">
                    <p className="text-xs text-muted-foreground">{t("messages.to", { email: m.toEmail })}</p>
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">{m.body}</p>
                    {m.status === "NOT_CONFIGURED" && (
                      <p className="text-xs text-muted-foreground">
                        {t("messages.notConfigured")}
                      </p>
                    )}
                    {m.error && <p className="text-xs text-destructive">{m.error}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("messages.dialogTitle", { name: patientName })}</DialogTitle>
            <DialogDescription>{t("messages.dialogBody", { email: patientEmail ?? "" })}</DialogDescription>
          </DialogHeader>
          {open && <Compose patientId={patientId} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Compose({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const { t, tError } = useI18n();
  const ready = subject.trim() !== "" && body.trim() !== "";

  function handleSend() {
    startTransition(async () => {
      const result = await sendPatientMessageAction(patientId, subject, body);
      if (!result.success) {
        toast.error(tError(result.error));
        return;
      }
      if (result.status === "SENT") toast.success(t("messages.sentToast"));
      else toast.warning(t("messages.notSentToast"));
      onDone();
    });
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="msg-subject">{t("messages.subject")}</Label>
        <Input id="msg-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="msg-body">{t("messages.body")}</Label>
        <Textarea
          id="msg-body"
          rows={8}
          value={body}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
          className={cn("min-h-40 resize-y")}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={isPending}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSend} disabled={!ready || isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {t("messages.send")}
        </Button>
      </div>
    </div>
  );
}
