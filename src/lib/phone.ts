import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

// Country used for numbers typed without a country code (the practice's region)
const FALLBACK_COUNTRY: CountryCode = "CA";

/** International format ("+1 514 555 0123", "+33 6 12 34 56 78") for any valid input, else null. */
export function normalizePhone(input: string, country: CountryCode = FALLBACK_COUNTRY): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  return parsed?.isValid() ? parsed.formatInternational() : null;
}

/** Display format for stored numbers; falls back to the raw value for legacy entries. */
export function formatPhone(value: string | null, country: CountryCode = FALLBACK_COUNTRY): string | null {
  if (!value) return null;
  return normalizePhone(value, country) ?? value;
}

/** Digit strings a phone can be searched by: international ("1514…") and national ("514…"). */
export function phoneSearchDigits(value: string | null, country: CountryCode = FALLBACK_COUNTRY): string[] {
  if (!value) return [];
  const parsed = parsePhoneNumberFromString(value, country);
  if (!parsed) return [value.replace(/\D/g, "")];
  return [parsed.number.replace(/\D/g, ""), parsed.formatNational().replace(/\D/g, "")];
}
