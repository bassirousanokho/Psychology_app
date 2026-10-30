
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePatientAuth } from "@/lib/patient-auth";
import { periodFor, upcomingTimeOff } from "@/lib/time-off";
import { portalI18n } from "@/i18n/server";
import { getBusyRanges } from "@/app/portal/actions";
import { BookingSlots } from "@/components/portal/booking-slots";

export default async function BookPage({ searchParams }: { searchParams: Promise<{ reschedule?: string }> }) {
  const session = await requirePatientAuth();
  const { t, fmt } = portalI18n(session.workspace);
  const { workspace, workspaceId } = session;

  // Moving an existing session: it must still be theirs and scheduled
  const { reschedule } = await searchParams;
  const moving = reschedule
    ? await prisma.appointment.findFirst({
        where: { id: reschedule, workspaceId, patientId: session.patientId, status: "SCHEDULED", startTime: { gt: new Date() } },
        select: { id: true, startTime: true },
      })
    : null;

  // Pre-fetch busy ranges for the next 14 working days
  // so the client component never needs to make extra round-trips
  const closures = await upcomingTimeOff(workspaceId);
  const dates: string[] = [];

  function isoDay(d: Date) { return d.getDay() === 0 ? 7 : d.getDay(); }

  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  // Scan at most ~3 months ahead so a workspace without working days can't hang the page
  for (let scanned = 0; dates.length < 14 && scanned < 90; scanned++) {
    const key = fmt(cursor, "yyyy-MM-dd");
    if (workspace.workingDays.includes(isoDay(cursor)) && !periodFor(closures, key)) dates.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  const busyByDate: Record<string, [number, number][]> = Object.fromEntries(
    await Promise.all(dates.map(async (d) => [d, await getBusyRanges(workspaceId, d, moving?.id)] as const)),
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{moving ? t("portal.moveTitle") : t("portal.bookTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("portal.bookHint")}
        </p>
      </div>

      {closures.length > 0 && (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          {t("portal.closed")}{" "}
          {closures
            .slice(0, 3)
            .map((c) =>
              c.start === c.end
                ? fmt(`${c.start}T12:00:00`, "d MMMM")
                : `${fmt(`${c.start}T12:00:00`, "d MMMM")} – ${fmt(`${c.end}T12:00:00`, "d MMMM")}`,
            )
            .join(", ")}
        </p>
      )}

      {moving && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <span>{t("portal.moving", { date: fmt(moving.startTime, "EEEE d MMMM, HH:mm") })}</span>
          <Link href="/portal/appointments" className="text-muted-foreground underline underline-offset-2">
            {t("common.cancel")}
          </Link>
        </div>
      )}

      <BookingSlots
        workingDays={workspace.workingDays}
        workingHoursStart={workspace.workingHoursStart}
        workingHoursEnd={workspace.workingHoursEnd}
        busyByDate={busyByDate}
        offDays={closures.map(({ start, end }) => ({ start, end }))}
        rescheduleId={moving?.id}
      />
    </div>
  );
}
