// Shared by server and client code.
import { format as formatDate } from "date-fns";
import { enCA, fr, frCA } from "date-fns/locale";
import { regionConfig } from "@/lib/regions";

export type Lang = "fr" | "en";

export function langOf(language: string | null | undefined): Lang {
  return language === "en" ? "en" : "fr";
}

/** Locale for numbers and dates: the language, in the practice's region. */
export function localeOf(lang: Lang, region: string | null | undefined): string {
  if (lang === "en") return "en-CA";
  return regionConfig(region).locale; // fr-CA or fr-FR
}

export function dateLocaleOf(lang: Lang, region: string | null | undefined) {
  if (lang === "en") return enCA;
  return regionConfig(region).locale === "fr-CA" ? frCA : fr;
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/** Long date in the practice's language, e.g. "20 octobre 2026" / "October 20, 2026". */
export function formatLongDate(date: Date, lang: Lang, region: string | null | undefined): string {
  return formatDate(date, lang === "en" ? "MMMM d, yyyy" : "d MMMM yyyy", { locale: dateLocaleOf(lang, region) });
}
