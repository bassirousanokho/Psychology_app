// Shared by server and client code.
import { format as formatDate } from "date-fns";
import { enCA, frCA } from "date-fns/locale";
import { messages, type MessageKey } from "./messages";
import { translateError } from "./errors";

export type Lang = "fr" | "en";
export type Vars = Record<string, string | number>;

export function toLang(language: string | null | undefined): Lang {
  return language === "en" ? "en" : "fr";
}

/** Message in the given language, with {placeholders} filled in. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text: string = messages[lang][key] ?? messages.en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`)) : text;
}

/**
 * @param locale number/date locale of the practice (language + region, e.g. "fr-CA",
 *   "fr-FR", "en-CA"); defaults from the language.
 */
export function makeI18n(lang: Lang, locale: string = lang === "fr" ? "fr-CA" : "en-CA") {
  const dateLocale = lang === "fr" ? frCA : enCA;
  return {
    lang,
    locale,
    dateLocale,
    /** Amount in the practice's number format, e.g. "70,00 $" / "$70.00" / "70,00 €". */
    money: (amount: number, currency: string) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount),
    t: (key: MessageKey, vars?: Vars) => translate(lang, key, vars),
    /** "one" or "other" message depending on the count. */
    tp: (count: number, key: string, vars?: Vars) =>
      translate(lang, `${key}.${count === 1 ? "one" : "other"}` as MessageKey, { count, ...vars }),
    /** date-fns format in the practice's language (pattern tokens are language-neutral). */
    fmt: (date: Date | string | number, pattern: string) => formatDate(new Date(date), pattern, { locale: dateLocale }),
    /** Server-action messages are English: show them in the practice's language. */
    tError: (message: string | undefined) => translateError(lang, message),
  };
}

export type I18n = ReturnType<typeof makeI18n>;
