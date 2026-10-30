// Shared by server and client code.

export type TimeOffPeriod = { id: string; start: string; end: string; label: string | null }; // YYYY-MM-DD, inclusive

/** The period covering a YYYY-MM-DD day, among those given. */
export function periodFor(periods: TimeOffPeriod[], day: string): TimeOffPeriod | undefined {
  return periods.find((p) => day >= p.start && day <= p.end);
}
