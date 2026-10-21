"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addLibraryNoteTemplate,
  deleteNoteTemplate,
  saveNoteTemplate,
} from "@/app/(dashboard)/dashboard/notes/templates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/client";

type Template = { id: string; name: string; body: string };
type Draft = { id?: string; name: string; body: string };

export function NoteTemplatesManager({
  templates,
  library,
}: {
  templates: Template[];
  library: { key: string; name: string }[];
}) {
  const { t, tError } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(ok);
        after?.();
      } else toast.error(tError(result.error));
    });
  }

  const missing = library.filter((l) => !templates.some((tpl) => tpl.name === l.name));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("noteTemplates.hint")}</p>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{t("noteTemplates.yours")}</h2>
          <Button size="sm" onClick={() => setDraft({ name: "", body: "" })} disabled={!!draft && !draft.id}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("noteTemplates.new")}
          </Button>
        </div>

        {draft && !draft.id && (
          <TemplateForm draft={draft} setDraft={setDraft} pending={isPending} onSave={() => run(() => saveNoteTemplate(draft), t("noteTemplates.saved"), () => setDraft(null))} />
        )}

        {templates.length === 0 && !draft ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t("noteTemplates.empty")}</p>
        ) : (
          <ul className="divide-y">
            {templates.map((tpl) =>
              draft?.id === tpl.id ? (
                <li key={tpl.id}>
                  <TemplateForm
                    draft={draft}
                    setDraft={setDraft}
                    pending={isPending}
                    onSave={() => run(() => saveNoteTemplate(draft), t("noteTemplates.saved"), () => setDraft(null))}
                  />
                </li>
              ) : (
                <li key={tpl.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tpl.name}</p>
                    <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{tpl.body}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title={t("noteTemplates.edit")} onClick={() => setDraft(tpl)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={t("noteTemplates.delete")}
                    disabled={isPending}
                    onClick={() => {
                      if (window.confirm(t("noteTemplates.confirmDelete", { name: tpl.name }))) {
                        run(() => deleteNoteTemplate(tpl.id), t("noteTemplates.deleted"));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl border bg-card px-5 py-4">
          <h2 className="font-semibold">{t("noteTemplates.library")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("noteTemplates.libraryHint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((l) => (
              <Button
                key={l.key}
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => addLibraryNoteTemplate(l.key), t("noteTemplates.added", { name: l.name }))}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {l.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  draft,
  setDraft,
  pending,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  pending: boolean;
  onSave: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 border-b bg-muted/30 px-5 py-4">
      <div className="space-y-1.5">
        <Label htmlFor="tpl-name">{t("noteTemplates.name")}</Label>
        <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tpl-body">{t("noteTemplates.body")}</Label>
        <Textarea
          id="tpl-body"
          rows={12}
          className="font-mono text-sm"
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {t("noteTemplates.save")}
        </Button>
      </div>
    </div>
  );
}
