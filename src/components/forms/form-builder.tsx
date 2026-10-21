"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { saveFormTemplate } from "@/app/(dashboard)/dashboard/forms/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_TYPES,
  FORM_KINDS,
  hasOptions,
  newFieldId,
  type FieldType,
  type FormField,
  type FormKind,
} from "@/lib/forms";
import { useI18n } from "@/i18n/client";

export type FormDraft = {
  id?: string;
  name: string;
  kind: FormKind;
  description: string;
  requiresSignature: boolean;
  fields: FormField[];
};

export function FormBuilder({ initial }: { initial: FormDraft }) {
  const router = useRouter();
  const { t, tError } = useI18n();
  const [form, setForm] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const setField = (id: string, patch: Partial<FormField>) =>
    setForm((f) => ({ ...f, fields: f.fields.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  function move(index: number, dir: -1 | 1) {
    setForm((f) => {
      const fields = [...f.fields];
      const [item] = fields.splice(index, 1);
      fields.splice(index + dir, 0, item);
      return { ...f, fields };
    });
  }

  function addField(type: FieldType) {
    setForm((f) => ({
      ...f,
      fields: [...f.fields, { id: newFieldId(), type, label: "", ...(hasOptions(type) ? { options: ["", ""] } : {}) }],
    }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveFormTemplate({ ...form, id: form.id });
      if (!result.success) {
        toast.error(tError(result.error));
        return;
      }
      toast.success(t("formBuilder.saved"));
      if (!form.id) router.replace(`/dashboard/forms/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="fb-name">{t("formBuilder.name")}</Label>
            <Input id="fb-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-kind">{t("formBuilder.kind")}</Label>
            <select
              id="fb-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as FormKind })}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {FORM_KINDS.map((k) => (
                <option key={k} value={k}>{t(`formKind.${k}`)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fb-desc">{t("formBuilder.description")}</Label>
          <Textarea id="fb-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.requiresSignature}
            onChange={(e) => setForm({ ...form, requiresSignature: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            {t("formBuilder.signature")}
            <span className="block text-xs text-muted-foreground">{t("formBuilder.signatureHint")}</span>
          </span>
        </label>
      </div>

      <div className="space-y-3">
        {form.fields.map((f, i) => (
          <div key={f.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={f.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  setField(f.id, { type, ...(hasOptions(type) && !f.options ? { options: ["", ""] } : {}) });
                }}
                aria-label={t("formBuilder.fieldType")}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{t(`fieldType.${ft}`)}</option>
                ))}
              </select>
              {f.type !== "heading" && f.type !== "paragraph" && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!!f.required}
                    onChange={(e) => setField(f.id, { required: e.target.checked })}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {t("formBuilder.required")}
                </label>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} title={t("formBuilder.up")}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={i === form.fields.length - 1}
                  onClick={() => move(i, 1)}
                  title={t("formBuilder.down")}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setForm((x) => ({ ...x, fields: x.fields.filter((y) => y.id !== f.id) }))}
                  title={t("formBuilder.remove")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {f.type === "paragraph" ? (
              <Textarea
                rows={4}
                value={f.label}
                placeholder={t("formBuilder.paragraphPlaceholder")}
                onChange={(e) => setField(f.id, { label: e.target.value })}
              />
            ) : (
              <Input
                value={f.label}
                placeholder={f.type === "heading" ? t("formBuilder.headingPlaceholder") : t("formBuilder.questionPlaceholder")}
                onChange={(e) => setField(f.id, { label: e.target.value })}
                className={f.type === "heading" ? "font-semibold" : undefined}
              />
            )}
            {f.type !== "heading" && f.type !== "paragraph" && (
              <Input
                value={f.help ?? ""}
                placeholder={t("formBuilder.helpPlaceholder")}
                onChange={(e) => setField(f.id, { help: e.target.value })}
                className="h-8 text-xs"
              />
            )}
            {hasOptions(f.type) && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("formBuilder.options")}</Label>
                <Textarea
                  rows={Math.max(2, (f.options ?? []).length)}
                  value={(f.options ?? []).join("\n")}
                  onChange={(e) => setField(f.id, { options: e.target.value.split("\n") })}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("formBuilder.add")}</p>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_TYPES.map((ft) => (
            <Button key={ft} variant="outline" size="sm" className="h-7 text-xs" onClick={() => addField(ft)}>
              <Plus className="mr-1 h-3 w-3" />
              {t(`fieldType.${ft}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t("formBuilder.save")}
        </Button>
      </div>
    </div>
  );
}
