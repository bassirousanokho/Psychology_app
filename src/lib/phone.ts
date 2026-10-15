import { parsePhoneNumberFromString } from "libphonenumber-js/min";

const DEFAULT_COUNTRY = "FR";

/** "+33 6 12 34 56 78" for any valid input ("0612345678", "+33612345678", …), else null. */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), DEFAULT_COUNTRY);
  return parsed?.isValid() ? parsed.formatInternational() : null;
}

/** Display format for stored numbers; falls back to the raw value for legacy entries. */
export function formatPhone(value: string | null): string | null {
  if (!value) return null;
  return normalizePhone(value) ?? value;
}

/** Digit strings a phone can be searched by: international ("33612…") and national ("0612…"). */
export function phoneSearchDigits(value: string | null): string[] {
  if (!value) return [];
  const parsed = parsePhoneNumberFromString(value, DEFAULT_COUNTRY);
  if (!parsed) return [value.replace(/\D/g, "")];
  return [parsed.number.replace(/\D/g, ""), parsed.formatNational().replace(/\D/g, "")];
}
