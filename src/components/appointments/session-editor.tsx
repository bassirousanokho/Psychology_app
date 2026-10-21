"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveDraftNotes,
  completeSession,
  reopenSession,
} from "@/app/(dashboard)/dashboard/appointments/[id]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { isHourly, type SessionType } from "@/lib/session-types";

type SaveIndicator = "idle" | "saving" | "saved" | "error";

export type SessionAppointment = {
  id: string;
  sessionNotes: string | null;
  noteCompletedAt: string | null; // ISO
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  type: SessionType;
  hasNoteFiles: boolean; // an uploaded note can replace typed notes
  startTime: string; // ISO
  endTime: string;   // ISO
  patient: {
    firstName: string;
    lastName: string;
    backgroundNotes: string | null;
  };
};

export type NoteTemplateOption = { id: string; name: string; body: string };

interface SessionEditorProps {
  appointment: SessionAppointment;
  templates: NoteTemplateOption[];
}

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: SaveIndicator }) {
  const { t } = useI18n();
  if (state === "idle") return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs transition-all",
        state === "saving" && "text-muted-foreground",
        state === "saved"  && "text-green-600 dark:text-green-400",
        state === "error"  && "text-destructive",
      )}
    >
      {state === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === "saved"  && <CheckCircle2 className="h-3 w-3" />}
      {state === "saving" ? t("editor.saving") : state === "saved" ? t("editor.saved") : t("editor.saveFailed")}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SessionEditor({ appointment, templates }: SessionEditorProps) {
  const [notes, setNotes]         = useState(appointment.sessionNotes ?? "");
  const [saveState, setSaveState] = useState<SaveIndicator>("idle");
  const [isPending, startTransition] = useTransition();
  const { t, tp, fmt, tError } = useI18n();

  const isCompleted = appointment.noteCompletedAt !== null;
  // Therapy sessions need typed notes or an uploaded note file; hourly work needs neither
  const canComplete =
    isHourly(appointment.type) || notes.trim().length > 0 || appointment.hasNoteFiles;

  // ── Auto-save draft every 2.5 s of inactivity ──
  const triggerAutoSave = useCallback(
    async (value: string) => {
      if (isCompleted) return; // never auto-save a completed session
      if (value === (appointment.sessionNotes ?? "")) return; // nothing changed
      setSaveState("saving");
      const result = await saveDraftNotes(appointment.id, value);
      setSaveState(result.success ? "saved" : "error");
      if (result.success) setTimeout(() => setSaveState("idle"), 2500);
    },
    [appointment.id, appointment.sessionNotes, isCompleted],
  );

  useEffect(() => {
    const timer = setTimeout(() => triggerAutoSave(notes), 2500);
    return () => clearTimeout(timer);
  }, [notes, triggerAutoSave]);

  // ── Manual draft save ──
  function handleSaveDraft() {
    startTransition(async () => {
      setSaveState("saving");
      const result = await saveDraftNotes(appointment.id, notes);
      setSaveState(result.success ? "saved" : "error");
      if (result.success) {
        setTimeout(() => setSaveState("idle"), 2500);
      } else {
        toast.error(tError(result.error));
      }
    });
  }

  // ── Insert a template (appended when notes are already written) ──
  function insertTemplate(id: string) {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setNotes((current) => (current.trim() ? `${current.trimEnd()}\n\n${tpl.body}` : tpl.body));
  }

  // ── Mark as completed ──
  function handleComplete() {
    startTransition(async () => {
      const result = await completeSession(appointment.id, notes);
      if (result.success) {
        toast.success(t("editor.completedToast"));
      } else {
        toast.error(tError(result.error));
      }
    });
  }

  // ── Reopen a completed session ──
  function handleReopen() {
    startTransition(async () => {
      const result = await reopenSession(appointment.id);
      if (result.success) {
        toast.success(t("editor.reopenedToast"));
      } else {
        toast.error(tError(result.error));
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Patient background notes ── */}
      {appointment.patient.backgroundNotes && (
        <section className="rounded-xl border bg-muted/40 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("editor.background")}
          </h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {appointment.patient.backgroundNotes}
          </p>
        </section>
      )}

      {/* ── Completed banner ── */}
      {isCompleted && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3 dark:border-green-900 dark:bg-green-950/30">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900 dark:text-green-200">
              {t("editor.completed")}
            </p>
            <p className="text-xs text-green-700 dark:text-green-400">
              {t("editor.finalised", { date: fmt(appointment.noteCompletedAt!, "EEEE d MMMM yyyy, HH:mm") })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-green-700 hover:text-green-900 dark:text-green-400"
            onClick={handleReopen}
            disabled={isPending}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            {t("editor.reopen")}
          </Button>
        </div>
      )}

      {/* ── Notes editor ── */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("editor.notes")}
          </h3>
          <div className="flex items-center gap-3">
            <SaveIndicator state={saveState} />
            {!isCompleted && (
              templates.length > 0 ? (
                <select
                  value=""
                  onChange={(e) => insertTemplate(e.target.value)}
                  aria-label={t("editor.insertTemplate")}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">{t("editor.insertTemplate")}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              ) : (
                <Link href="/dashboard/notes/templates" className="text-xs text-muted-foreground underline underline-offset-2">
                  {t("editor.setUpTemplates")}
                </Link>
              )
            )}
          </div>
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isCompleted ? t("editor.placeholderCompleted") : t("editor.placeholder")}
          className={cn(
            "min-h-[400px] resize-y font-[inherit] text-base leading-relaxed",
            "placeholder:text-muted-foreground/50",
            isCompleted && "cursor-default bg-muted/30",
          )}
          disabled={isCompleted}
          aria-label={t("editor.notes")}
        />

        <p className="mt-1.5 text-right text-xs text-muted-foreground">
          {tp(notes.trim().split(/\s+/).filter(Boolean).length, "editor.words")}
        </p>
      </section>

      {/* ── Actions ── */}
      {!isCompleted && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isPending}
          >
            {isPending && saveState === "saving" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("editor.saveDraft")}
          </Button>

          <Button
            onClick={handleComplete}
            disabled={isPending || !canComplete}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {t("editor.complete")}
          </Button>

          {!canComplete && (
            <p className="text-xs text-muted-foreground">
              {t("editor.needContent")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
