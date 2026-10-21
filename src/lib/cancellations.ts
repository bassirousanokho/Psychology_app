import { format, startOfMonth, subDays, subMonths } from "date-fns";

export const ALERT_WINDOW_DAYS = 30;

type Cancellable = {
  status: string;
  startTime: Date;
  cancelledAt: Date | null;
  cancellationFee: unknown; // Decimal | null
};

export type CancellationStats = {
  last30Days: number; // cancellations and no-shows (the alert)
  thisMonth: number;
  last12Months: number;
  withFee12Months: number;
  noShows12Months: number;
  byMonth: { month: string; cancellations: number; noShows: number }[]; // newest first, months with activity
};

/** Cancellations are counted on the day they were made; no-shows on the session date. */
export function cancellationStats(appts: Cancellable[], now = new Date()): CancellationStats {
  const since30 = subDays(now, ALERT_WINDOW_DAYS);
  const monthStart = startOfMonth(now);
  const since12 = startOfMonth(subMonths(now, 11));
  const byMonth = new Map<string, { cancellations: number; noShows: number }>();
  const stats: CancellationStats = {
    last30Days: 0,
    thisMonth: 0,
    last12Months: 0,
    withFee12Months: 0,
    noShows12Months: 0,
    byMonth: [],
  };

  for (const a of appts) {
    if (a.status === "CANCELLED" && a.cancelledAt) {
      if (a.cancelledAt >= since30) stats.last30Days++;
      if (a.cancelledAt >= monthStart) stats.thisMonth++;
      if (a.cancelledAt >= since12) {
        stats.last12Months++;
        if (a.cancellationFee != null) stats.withFee12Months++;
        const key = format(a.cancelledAt, "yyyy-MM");
        const m = byMonth.get(key) ?? { cancellations: 0, noShows: 0 };
        m.cancellations++;
        byMonth.set(key, m);
      }
    } else if (a.status === "NO_SHOW" && a.startTime >= since12 && a.startTime <= now) {
      // No-shows count towards the alert too (on the session date)
      if (a.startTime >= since30) stats.last30Days++;
      stats.noShows12Months++;
      const key = format(a.startTime, "yyyy-MM");
      const m = byMonth.get(key) ?? { cancellations: 0, noShows: 0 };
      m.noShows++;
      byMonth.set(key, m);
    }
  }

  stats.byMonth = [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({ month, ...v }));
  return stats;
}
