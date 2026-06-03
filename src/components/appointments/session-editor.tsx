"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  FileEdit,
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SaveIndicator = "idle" | "saving" | "saved" | "error";

export type SessionAppointment = {
  id: string;
  sessionNotes: string | null;
  noteCompletedAt: string | null; // ISO
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  startTime: string; // ISO
  endTime: string;   // ISO
  patient: {
    firstName: string;
    lastName: string;
    backgroundNotes: string | null;
  };
};

interface SessionEditorProps {
  appointment: SessionAppointment;
}

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: SaveIndicator }) {
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
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save failed"}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SessionEditor({ appointment }: SessionEditorProps) {
  const [notes, setNotes]         = useState(appointment.sessionNotes ?? "");
  const [saveState, setSaveState] = useState<SaveIndicator>("idle");
  const [isPending, startTransition] = useTransition();

  const isCompleted = appointment.noteCompletedAt !== null;

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
        toast.error(result.error);
      }
    });
  }

  // ── Mark as completed ──
  function handleComplete() {
    startTransition(async () => {
      const result = await completeSession(appointment.id, notes);
      if (result.success) {
        toast.success("Session marked as completed");
      } else {
        toast.error(result.error);
      }
    });
  }

  // ── Reopen a completed session ──
  function handleReopen() {
    startTransition(async () => {
      const result = await reopenSession(appointment.id);
      if (result.success) {
        toast.success("Session reopened");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Patient background notes ── */}
      {appointment.patient.backgroundNotes && (
        <section className="rounded-xl border bg-muted/40 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Patient Background
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
              Session completed
            </p>
            <p className="text-xs text-green-700 dark:text-green-400">
              Notes finalised on{" "}
              {format(new Date(appointment.noteCompletedAt!), "EEEE d MMMM yyyy 'at' HH:mm")}
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
            Reopen
          </Button>
        </div>
      )}

      {/* ── Notes editor ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Session Notes
          </h3>
          <SaveIndicator state={saveState} />
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            isCompleted
              ? "No notes recorded for this session."
              : "Write your session notes here…\n\nConsider covering: presenting issue, affect & mood, key themes, interventions used, patient response, homework set, risk assessment, plan for next session."
          }
          className={cn(
            "min-h-[400px] resize-y font-[inherit] text-base leading-relaxed",
            "placeholder:text-muted-foreground/50",
            isCompleted && "cursor-default bg-muted/30",
          )}
          disabled={isCompleted}
          aria-label="Session notes"
        />

        <p className="mt-1.5 text-right text-xs text-muted-foreground">
          {notes.trim().split(/\s+/).filter(Boolean).length} words
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
            Save draft
          </Button>

          <Button
            onClick={handleComplete}
            disabled={isPending || notes.trim().length === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Mark as completed
          </Button>

          {notes.trim().length === 0 && (
            <p className="text-xs text-muted-foreground">
              Write at least a few words before completing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
