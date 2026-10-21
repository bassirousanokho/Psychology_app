import { formatLegalValue } from "@/lib/invoice-legal";
import { regionConfig, type LegalField } from "@/lib/regions";

/** Practitioner identity and registration numbers, as printed on invoices and statements. */
export function IssuerBlock({
  workspace: ws,
}: {
  workspace: {
    name: string;
    region: string;
    practitionerName: string | null;
    professionalTitle: string | null;
    address: string | null;
  } & Record<LegalField, string | null>;
}) {
  const cfg = regionConfig(ws.region);
  return (
    <div className="text-sm leading-relaxed">
      <p className="text-lg font-bold">{ws.practitionerName || ws.name}</p>
      {ws.professionalTitle && <p className="text-gray-600">{ws.professionalTitle}</p>}
      {ws.address && <p className="whitespace-pre-line text-gray-600">{ws.address}</p>}
      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
        {cfg.legalFields.map((f) =>
          ws[f.key] ? (
            <p key={f.key}>
              {f.invoiceLabel} : {formatLegalValue(f.key, ws[f.key]!)}
            </p>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Workspace fields IssuerBlock needs, for Prisma selects. */
export const ISSUER_SELECT = {
  name: true,
  region: true,
  practitionerName: true,
  professionalTitle: true,
  address: true,
  permitNumber: true,
  neq: true,
  gstNumber: true,
  qstNumber: true,
  siret: true,
  adeli: true,
  rpps: true,
} as const;
