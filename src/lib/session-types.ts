// Shared by server and client code (no Prisma import).

export const SESSION_TYPES = ["PSYCHOTHERAPY", "ADMIN", "WRITING", "CONFERENCE"] as const;
export type HourlyType = Exclude<SessionType, "PSYCHOTHERAPY">;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  PSYCHOTHERAPY: "Psychotherapy",
  ADMIN: "Administrative work",
  WRITING: "Report writing",
  CONFERENCE: "Conference",
};

/** Invoice line description (invoices are issued in French). */
export const SESSION_TYPE_INVOICE_LABELS: Record<SessionType, string> = {
  PSYCHOTHERAPY: "Séance de psychothérapie",
  ADMIN: "Travail administratif",
  WRITING: "Rédaction de compte rendu",
  CONFERENCE: "Conférence",
};

/**
 * Hourly work is billed by time spent (half-hour steps), may overlap anything in
 * the calendar, and can be completed without typed notes.
 */
export function isHourly(type: SessionType): type is HourlyType {
  return type !== "PSYCHOTHERAPY";
}

export const HOURLY_STEP_MIN = 30;
export const HOURLY_DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * HOURLY_STEP_MIN); // 30 min … 8 h

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** Price of hourly work, rounded to the cent. */
export function hourlyAmount(rate: number, minutes: number): number {
  return Math.round(rate * (minutes / 60) * 100) / 100;
}

/** Most sessions a recurring booking can create at once (a year of weekly sessions). */
export const MAX_OCCURRENCES = 52;

/** The practice's hourly rate for a kind of hourly work. */
export function hourlyRateFor(
  ws: { hourlyRateAdmin: unknown; hourlyRateWriting: unknown; hourlyRateConference: unknown },
  type: HourlyType,
): number {
  return Number(type === "ADMIN" ? ws.hourlyRateAdmin : type === "WRITING" ? ws.hourlyRateWriting : ws.hourlyRateConference);
}
