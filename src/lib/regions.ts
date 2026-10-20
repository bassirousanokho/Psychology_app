// Shared by server and client code. A practice's region drives its currency,
// phone format, legal fields and invoice wording.

import type { CountryCode } from "libphonenumber-js/min";

export const REGIONS = ["CA-QC", "FR"] as const;
export type Region = (typeof REGIONS)[number];
export const DEFAULT_REGION: Region = "CA-QC";

export type LegalField = "permitNumber" | "neq" | "gstNumber" | "qstNumber" | "siret" | "adeli" | "rpps";

type RegionConfig = {
  label: string;
  currency: string;
  phoneCountry: CountryCode;
  locale: string; // invoice language / number and date formats
  invoiceTitle: string;
  receiptTitle: string;
  taxMention: string; // pre-filled tax exemption mention
  paymentTerms: string;
  addressPlaceholder: string;
  phonePlaceholder: string;
  // Registration fields shown in Settings and printed on invoices, in order
  legalFields: { key: LegalField; label: string; invoiceLabel: string; required?: boolean; placeholder: string }[];
};

export const REGION_CONFIG: Record<Region, RegionConfig> = {
  "CA-QC": {
    label: "Canada — Québec",
    currency: "CAD",
    phoneCountry: "CA",
    locale: "fr-CA",
    invoiceTitle: "Facture",
    receiptTitle: "Reçu",
    taxMention: "Services de psychothérapie exonérés de TPS et de TVQ.",
    paymentTerms: "Paiement exigible le jour de la séance.",
    addressPlaceholder: "1234 rue Saint-Denis\nMontréal (Québec) H2X 3K2",
    phonePlaceholder: "+1 514 555 0123",
    legalFields: [
      { key: "permitNumber", label: "OPQ permit number", invoiceLabel: "N° de permis OPQ", required: true, placeholder: "12345-67" },
      { key: "neq", label: "NEQ (Québec enterprise number)", invoiceLabel: "NEQ", placeholder: "1171234567" },
      { key: "gstNumber", label: "GST number (if registered)", invoiceLabel: "N° TPS", placeholder: "123456789 RT0001" },
      { key: "qstNumber", label: "QST number (if registered)", invoiceLabel: "N° TVQ", placeholder: "1234567890 TQ0001" },
    ],
  },
  FR: {
    label: "France",
    currency: "EUR",
    phoneCountry: "FR",
    locale: "fr-FR",
    invoiceTitle: "Note d'honoraires",
    receiptTitle: "Reçu",
    taxMention: "TVA non applicable, art. 261-4-1° du CGI",
    paymentTerms: "Paiement à réception, le jour de la séance.",
    addressPlaceholder: "12 rue de la Paix\n75002 Paris",
    phonePlaceholder: "+33 6 00 00 00 00",
    legalFields: [
      { key: "siret", label: "SIRET (14 digits)", invoiceLabel: "SIRET", required: true, placeholder: "123 456 789 00012" },
      { key: "adeli", label: "ADELI (9 digits)", invoiceLabel: "N° ADELI", placeholder: "759312345" },
      { key: "rpps", label: "RPPS (11 digits)", invoiceLabel: "N° RPPS", placeholder: "10001234567" },
    ],
  },
};

export function regionConfig(region: string | null | undefined): RegionConfig {
  return REGION_CONFIG[(REGIONS as readonly string[]).includes(region ?? "") ? (region as Region) : DEFAULT_REGION];
}
