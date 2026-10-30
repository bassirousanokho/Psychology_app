// Time off: whole days (practice time zone) without therapy sessions.

import { format } from "date-fns";
import prisma from "@/lib/prisma";

import type { TimeOffPeriod } from "@/lib/time-off-shared";

export type { TimeOffPeriod };
export { periodFor } from "@/lib/time-off-shared";

/** Calendar day of a moment in the practice's time zone, as stored in DATE columns. */
function dayOf(d: Date): Date {
  return new Date(`${format(d, "yyyy-MM-dd")}T00:00:00Z`);
}

const toPeriod = (t: { id: string; startDate: Date; endDate: Date; label: string | null }): TimeOffPeriod => ({
  id: t.id,
  start: t.startDate.toISOString().slice(0, 10),
  end: t.endDate.toISOString().slice(0, 10),
  label: t.label,
});

/** The time off covering the day a session starts, if any. */
export async function timeOffOn(workspaceId: string, start: Date): Promise<TimeOffPeriod | null> {
  const day = dayOf(start);
  const t = await prisma.timeOff.findFirst({
    where: { workspaceId, startDate: { lte: day }, endDate: { gte: day } },
  });
  return t ? toPeriod(t) : null;
}

/** Time off overlapping a range of moments (e.g. the dates a calendar view shows). */
export async function timeOffBetween(workspaceId: string, from: Date, to: Date): Promise<TimeOffPeriod[]> {
  const rows = await prisma.timeOff.findMany({
    where: { workspaceId, startDate: { lte: dayOf(to) }, endDate: { gte: dayOf(from) } },
    orderBy: { startDate: "asc" },
  });
  return rows.map(toPeriod);
}

/** Today and later, for the time off list and the booking forms. */
export async function upcomingTimeOff(workspaceId: string): Promise<TimeOffPeriod[]> {
  const rows = await prisma.timeOff.findMany({
    where: { workspaceId, endDate: { gte: dayOf(new Date()) } },
    orderBy: { startDate: "asc" },
    take: 50,
  });
  return rows.map(toPeriod);
}

export const AWAY_ERROR = "You're away that day (time off): no therapy session can be booked";
