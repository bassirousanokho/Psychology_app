"use client";

import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PendingAppointment = {
  id: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  patient: {
    firstName: string;
    lastName: string;
  };
};

interface PendingTasksProps {
  appointments: PendingAppointment[];
}

export function PendingTasks({ appointments }: PendingTasksProps) {
  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
          <div>
            <h3 className="font-semibold">Missing Notes</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              All sessions are documented. Great work!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold">Missing Notes</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {appointments.length} session{appointments.length !== 1 ? "s" : ""} pending
        </span>
      </div>

      {/* List */}
      <ul className="divide-y">
        {appointments.map((appt) => {
          const start     = new Date(appt.startTime);
          const end       = new Date(appt.endTime);
          const hoursAgo  = formatDistanceToNow(end, { addSuffix: true });

          return (
            <li key={appt.id} className="flex items-center gap-4 px-5 py-3 group">
              {/* Dot indicator */}
              <div className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {appt.patient.lastName}, {appt.patient.firstName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(start, "EEE d MMM, HH:mm")} &middot; ended {hoursAgo}
                </p>
              </div>

              {/* Link to workspace */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                render={<Link href={`/dashboard/appointments/${appt.id}`} />}
              >
                Write notes
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>

      {appointments.length > 5 && (
        <div className="border-t px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {appointments.length} pending sessions.{" "}
            <Link href="/dashboard/notes" className="underline underline-offset-2">
              View all
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
