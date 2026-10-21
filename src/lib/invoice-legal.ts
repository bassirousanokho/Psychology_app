// Shared by server and client code.
import { regionConfig, type LegalField } from "@/lib/regions";
import type { MessageKey } from "@/i18n/messages";

type LegalDetails = { region?: string | null; address?: string | null; vatMention?: string | null } & Partial<
  Record<LegalField, string | null>
>;

const filled = (v: string | null | undefined) => !!v && v.trim() !== "";

/** Details the practice's invoices must show (per region), as message keys; listed until filled in. */
export function missingLegalDetails(d: LegalDetails): MessageKey[] {
  const cfg = regionConfig(d.region);
  const missing: MessageKey[] = [];
  if (!filled(d.address)) missing.push("legal.address");
  if (cfg.legalFields.some((f) => f.key === "permitNumber") && !filled(d.permitNumber)) missing.push("legal.permit");
  if (cfg.legalFields.some((f) => f.key === "siret") && !filled(d.siret)) missing.push("legal.siret");
  // France: one of ADELI / RPPS is required
  if (d.region === "FR" && !filled(d.adeli) && !filled(d.rpps)) missing.push("legal.adeliRpps");
  if (!filled(d.vatMention)) missing.push("legal.taxMention");
  return missing;
}

/** Value as printed on invoices ("123 456 789 00012" for a SIRET). */
export function formatLegalValue(key: LegalField, value: string): string {
  if (key === "siret") return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4");
  return value;
}

