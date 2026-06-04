import { format, addDays } from "date-fns";
import { requirePatientAuth } from "@/lib/patient-auth";
import { getBookedHours } from "@/app/portal/actions";
import { BookingSlots } from "@/components/portal/booking-slots";

export default async function BookPage() {
  const session = await requirePatientAuth();
  const { workspace, workspaceId } = session;

  // Pre-fetch booked hours for the next 14 working days
  // so the client component never needs to make extra round-trips
  const bookedByDate: Record<string, number[]> = {};

  function isoDay(d: Date) { return d.getDay() === 0 ? 7 : d.getDay(); }

  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  let count = 0;
  while (count < 14) {
    if (workspace.workingDays.includes(isoDay(cursor))) {
      const key = format(cursor, "yyyy-MM-dd");
      bookedByDate[key] = await getBookedHours(workspaceId, key);
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Book a session</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sessions are 60 minutes. Pick a date and available time slot below.
        </p>
      </div>

      <BookingSlots
        workingDays={workspace.workingDays}
        workingHoursStart={workspace.workingHoursStart}
        workingHoursEnd={workspace.workingHoursEnd}
        bookedByDate={bookedByDate}
      />
    </div>
  );
}
