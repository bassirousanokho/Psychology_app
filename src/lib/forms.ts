// Shared by server and client code: form fields, answers and their validation.

export const FIELD_TYPES = [
  "heading",     // section title (no answer)
  "paragraph",   // text to read, e.g. consent terms (no answer)
  "text",        // short answer
  "textarea",    // long answer
  "choice",      // one option
  "multichoice", // several options
  "yesno",
  "date",
  "scale",       // 0 to 10
  "checkbox",    // a statement to tick, e.g. "I have read and agree"
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[]; // choice, multichoice
};

export type AnswerValue = string | string[] | boolean | number | null;
export type Answers = Record<string, AnswerValue>;

export const FORM_KINDS = ["INTAKE", "CONSENT", "QUESTIONNAIRE"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

const MAX_FIELDS = 100;
const MAX_TEXT = 5000;

/** Fields that take an answer (headings and paragraphs are only displayed). */
export function isInput(field: FormField): boolean {
  return field.type !== "heading" && field.type !== "paragraph";
}

export function hasOptions(type: FieldType): boolean {
  return type === "choice" || type === "multichoice";
}

/** Fields read back from the database, keeping only well-formed ones. */
export function parseFields(json: unknown): FormField[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((f): FormField[] => {
    if (!f || typeof f !== "object") return [];
    const { id, type, label, help, required, options } = f as Record<string, unknown>;
    if (typeof id !== "string" || typeof label !== "string" || !FIELD_TYPES.includes(type as FieldType)) return [];
    return [
      {
        id,
        type: type as FieldType,
        label,
        ...(typeof help === "string" && help ? { help } : {}),
        ...(required === true ? { required: true } : {}),
        ...(Array.isArray(options) ? { options: options.filter((o): o is string => typeof o === "string") } : {}),
      },
    ];
  });
}

/** Checks a template's fields before saving. Returns an error message, or null. */
export function validateFields(fields: FormField[]): string | null {
  if (fields.length === 0) return "Add at least one field";
  if (fields.length > MAX_FIELDS) return `At most ${MAX_FIELDS} fields`;
  if (!fields.some(isInput)) return "Add at least one question";
  const ids = new Set<string>();
  for (const f of fields) {
    if (!f.label.trim()) return "Every field needs a label";
    if (f.label.length > MAX_TEXT) return "A label is too long";
    if (ids.has(f.id)) return "Duplicate field";
    ids.add(f.id);
    if (hasOptions(f.type) && (!f.options || f.options.filter((o) => o.trim()).length < 2)) {
      return "Choice questions need at least two options";
    }
  }
  return null;
}

function isEmpty(v: AnswerValue | undefined): boolean {
  return v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

/**
 * Keeps only answers to the form's questions, in the expected shape, and checks
 * required ones. Returns the cleaned answers or an error message.
 */
export function cleanAnswers(fields: FormField[], raw: Answers): { answers: Answers } | { error: string } {
  const answers: Answers = {};
  for (const f of fields.filter(isInput)) {
    let v = raw[f.id];
    switch (f.type) {
      case "text":
      case "textarea":
      case "date":
        v = typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : null;
        if (f.type === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = null;
        break;
      case "choice":
        v = typeof v === "string" && f.options?.includes(v) ? v : null;
        break;
      case "multichoice":
        v = Array.isArray(v) ? v.filter((o) => typeof o === "string" && f.options?.includes(o)) : [];
        break;
      case "yesno":
        v = v === "yes" || v === "no" ? v : null;
        break;
      case "scale":
        v = typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10 ? v : null;
        break;
      case "checkbox":
        v = v === true;
        break;
    }
    if (f.required && isEmpty(v)) return { error: "Please answer every required question" };
    answers[f.id] = v ?? null;
  }
  return { answers };
}

/** An answer as plain text, for the response page and exports. */
export function answerText(field: FormField, value: AnswerValue | undefined, lang: "fr" | "en"): string {
  const none = lang === "fr" ? "—" : "—";
  if (isEmpty(value) && field.type !== "checkbox") return none;
  switch (field.type) {
    case "multichoice":
      return (value as string[]).join(", ");
    case "yesno":
      return value === "yes" ? (lang === "fr" ? "Oui" : "Yes") : lang === "fr" ? "Non" : "No";
    case "checkbox":
      return value === true ? (lang === "fr" ? "Coché" : "Ticked") : lang === "fr" ? "Non coché" : "Not ticked";
    case "scale":
      return `${value} / 10`;
    default:
      return String(value);
  }
}

/** Plain-text rendering of a completed form (exports). */
export function responseText(
  form: { name: string; fields: FormField[] },
  answers: Answers,
  lang: "fr" | "en",
): string {
  const out: string[] = [form.name, "=".repeat(form.name.length), ""];
  for (const f of form.fields) {
    if (f.type === "heading") out.push("", `## ${f.label}`, "");
    else if (f.type === "paragraph") out.push(f.label, "");
    else out.push(`${f.label}`, `  ${answerText(f, answers[f.id], lang)}`, "");
  }
  return out.join("\n");
}

export function newFieldId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

/** Form links stop working after this many days. */
export const FORM_LINK_DAYS = 60;

export function linkExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > FORM_LINK_DAYS * 86_400_000;
}
