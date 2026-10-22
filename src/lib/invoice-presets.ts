import type { ServicePreset } from "@/components/billing/invoice-editor";

/** Quick-add services in the invoice editor, at the practice's rates. */
export function invoicePresets(ws: {
  defaultTariff: unknown;
  hourlyRateAdmin: unknown;
  hourlyRateWriting: unknown;
  hourlyRateConference: unknown;
}): ServicePreset[] {
  return [
    { type: "PSYCHOTHERAPY", unitPrice: Number(ws.defaultTariff), hourly: false },
    { type: "ADMIN", unitPrice: Number(ws.hourlyRateAdmin), hourly: true },
    { type: "WRITING", unitPrice: Number(ws.hourlyRateWriting), hourly: true },
    { type: "CONFERENCE", unitPrice: Number(ws.hourlyRateConference), hourly: true },
  ];
}
