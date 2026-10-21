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

/** Session date and time for emails, e.g. "mardi 21 octobre à 14 h 00" / "Tuesday, October 21 at 2:00 PM". */
export function formatWhen(date: Date, lang: Lang, region: string | null | undefined): string {
  const locale = dateLocaleOf(lang, region);
  return lang === "fr"
    ? formatDate(date, "EEEE d MMMM 'à' H 'h' mm", { locale })
    : formatDate(date, "EEEE, MMMM d 'at' h:mm a", { locale });
}
