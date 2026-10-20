// Shared by server and client code (no Prisma import).

export const SESSION_TYPES = ["PSYCHOTHERAPY", "ADMIN", "WRITING"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  PSYCHOTHERAPY: "Psychotherapy",
  ADMIN: "Administrative work",
  WRITING: "Report writing",
};

/** Invoice line description. */
export const SESSION_TYPE_INVOICE_LABELS: Record<SessionType, string> = {
  PSYCHOTHERAPY: "Therapy session",
  ADMIN: "Administrative work",
  WRITING: "Report writing",
};

/**
 * Hourly work is billed by time spent (half-hour steps), may overlap anything in
 * the calendar, and can be completed without typed notes.
 */
export function isHourly(type: SessionType): boolean {
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
