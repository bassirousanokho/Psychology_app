// Shared by server and client code.
import { regionConfig, type LegalField } from "@/lib/regions";

type LegalDetails = { region?: string | null; address?: string | null; vatMention?: string | null } & Partial<
  Record<LegalField, string | null>
>;

const filled = (v: string | null | undefined) => !!v && v.trim() !== "";

/** Details the practice's invoices must show (per region); listed until filled in. */
export function missingLegalDetails(d: LegalDetails): string[] {
  const cfg = regionConfig(d.region);
  const missing: string[] = [];
  if (!filled(d.address)) missing.push("Professional address");
  for (const f of cfg.legalFields) if (f.required && !filled(d[f.key])) missing.push(f.label);
  // France: one of ADELI / RPPS is required
  if (d.region === "FR" && !filled(d.adeli) && !filled(d.rpps)) missing.push("ADELI or RPPS number");
  if (!filled(d.vatMention)) missing.push("Tax mention");
  return missing;
}

/** Value as printed on invoices ("123 456 789 00012" for a SIRET). */
export function formatLegalValue(key: LegalField, value: string): string {
  if (key === "siret") return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4");
  return value;
}
