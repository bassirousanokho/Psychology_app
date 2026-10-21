"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitForm } from "@/app/form/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isInput, type Answers, type AnswerValue, type FormField } from "@/lib/forms";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface FormFillerProps {
  token: string;
  fields: FormField[];
  requiresSignature: boolean;
  patientName: string;
}

export function FormFiller({ token, fields, requiresSignature, patientName }: FormFillerProps) {
  const { t, tError } = useI18n();
  const [answers, setAnswers] = useState<Answers>({});
  const [signature, setSignature] = useState("");
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = (id: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    setMissing((m) => {
      if (!m.has(id)) return m;
      const next = new Set(m);
      next.delete(id);
      return next;
    });
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const empty = fields.filter((f) => {
      if (!isInput(f) || !f.required) return false;
      const v = answers[f.id];
      return v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
    });
    if (empty.length > 0) {
      setMissing(new Set(empty.map((f) => f.id)));
      setError(t("form.missing"));
      document.getElementById(`q-${empty[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (requiresSignature && signature.trim().length < 2) {
      setError(t("form.signatureMissing"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitForm(token, answers, requiresSignature ? signature : null);
      if (result.success) {
        setDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setError(tError(result.error));
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="text-lg font-semibold">{t("form.thanks")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("form.thanksBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {fields.map((f) => (
        <Field key={f.id} field={f} value={answers[f.id]} onChange={(v) => set(f.id, v)} invalid={missing.has(f.id)} />
      ))}

      {requiresSignature && (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
          <Label htmlFor="signature" className="text-sm font-semibold">{t("form.signature")}</Label>
          <p className="text-xs text-muted-foreground">{t("form.signatureHint", { name: patientName })}</p>
          <Input
            id="signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={patientName}
            autoComplete="name"
            className="font-serif text-lg italic"
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {requiresSignature ? t("form.signAndSend") : t("form.send")}
      </Button>
    </form>
  );
}

function Field({
  field: f,
  value,
  onChange,
  invalid,
}: {
  field: FormField;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  invalid: boolean;
}) {
  const { t } = useI18n();
  if (f.type === "heading") return <h2 className="border-b pb-1 pt-2 text-base font-semibold">{f.label}</h2>;
  if (f.type === "paragraph") return <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{f.label}</p>;

  const id = `q-${f.id}`;
  const label = (
    <>
      {f.label}
      {f.required && <span className="ml-0.5 text-destructive">*</span>}
    </>
  );
  const help = f.help && <p className="text-xs text-muted-foreground">{f.help}</p>;
  const wrap = (children: React.ReactNode, asFieldset = false) =>
    asFieldset ? (
      <fieldset id={id} className={cn("space-y-2 rounded-lg", invalid && "outline outline-2 outline-offset-4 outline-destructive")}>
        <legend className="mb-2 text-sm font-medium">{label}</legend>
        {help}
        {children}
      </fieldset>
    ) : (
      <div id={id} className={cn("space-y-1.5 rounded-lg", invalid && "outline outline-2 outline-offset-4 outline-destructive")}>
        <Label htmlFor={`${id}-input`} className="text-sm font-medium leading-snug">{label}</Label>
        {help}
        {children}
      </div>
    );

  switch (f.type) {
    case "text":
      return wrap(<Input id={`${id}-input`} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />);
    case "textarea":
      return wrap(<Textarea id={`${id}-input`} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />);
    case "date":
      return wrap(<Input id={`${id}-input`} type="date" className="w-44" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />);
    case "choice":
      return wrap(
        <div className="space-y-1.5">
          {f.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" name={id} checked={value === o} onChange={() => onChange(o)} className="h-4 w-4 accent-primary" />
              {o}
            </label>
          ))}
        </div>,
        true,
      );
    case "multichoice": {
      const list = Array.isArray(value) ? value : [];
      return wrap(
        <div className="space-y-1.5">
          {f.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={list.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
                className="h-4 w-4 accent-primary"
              />
              {o}
            </label>
          ))}
        </div>,
        true,
      );
    }
    case "yesno":
      return wrap(
        <div className="flex gap-4">
          {(["yes", "no"] as const).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" name={id} checked={value === o} onChange={() => onChange(o)} className="h-4 w-4 accent-primary" />
              {o === "yes" ? t("form.yes") : t("form.no")}
            </label>
          ))}
        </div>,
        true,
      );
    case "scale":
      return wrap(
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={value === n}
              className={cn(
                "h-9 w-9 rounded-md border text-sm tabular-nums transition-colors",
                value === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {n}
            </button>
          ))}
        </div>,
        true,
      );
    case "checkbox":
      return (
        <label
          id={id}
          className={cn("flex items-start gap-2.5 rounded-lg text-sm", invalid && "outline outline-2 outline-offset-4 outline-destructive")}
        >
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span>
            {label}
            {help}
          </span>
        </label>
      );
  }
}
