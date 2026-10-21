
import { requirePatientAuth } from "@/lib/patient-auth";
import { portalI18n } from "@/i18n/server";
import { getBusyRanges } from "@/app/portal/actions";
import { BookingSlots } from "@/components/portal/booking-slots";

export default async function BookPage() {
  const session = await requirePatientAuth();
  const { t, fmt } = portalI18n(session.workspace);
  const { workspace, workspaceId } = session;

  // Pre-fetch busy ranges for the next 14 working days
  // so the client component never needs to make extra round-trips
  const dates: string[] = [];

  function isoDay(d: Date) { return d.getDay() === 0 ? 7 : d.getDay(); }

  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  // Scan at most ~3 months ahead so a workspace without working days can't hang the page
  for (let scanned = 0; dates.length < 14 && scanned < 90; scanned++) {
    if (workspace.workingDays.includes(isoDay(cursor))) dates.push(fmt(cursor, "yyyy-MM-dd"));
    cursor.setDate(cursor.getDate() + 1);
  }
  const busyByDate: Record<string, [number, number][]> = Object.fromEntries(
    await Promise.all(dates.map(async (d) => [d, await getBusyRanges(workspaceId, d)] as const)),
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("portal.bookTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("portal.bookHint")}
        </p>
      </div>

      <BookingSlots
        workingDays={workspace.workingDays}
        workingHoursStart={workspace.workingHoursStart}
        workingHoursEnd={workspace.workingHoursEnd}
        busyByDate={busyByDate}
      />
    </div>
  );
}
