import Link from "next/link";
import { format } from "date-fns";
import { CalendarPlus, CalendarDays, FileText } from "lucide-react";
import { requirePatientAuth } from "@/lib/patient-auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANTS = {
  SCHEDULED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW:   "destructive",
} as const;

export default async function PortalDashboardPage() {
  const session = await requirePatientAuth();

  const now = new Date();

  const [upcoming, recentDocs] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        workspaceId: session.workspaceId,
        patientId: session.patientId,
        startTime: { gte: now },
        status: "SCHEDULED",
      },
      orderBy: { startTime: "asc" },
      take: 3,
    }),
    prisma.document.findMany({
      where: {
        workspaceId: session.workspaceId,
        patientId: session.patientId,
        sharedWithPatient: true,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">
          Hello, {session.patient.firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Welcome to your patient portal at {session.workspace.name}.
        </p>
      </div>

      {/* Upcoming appointments */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Upcoming appointments
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            render={<Link href="/portal/book" />}
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Book session
          </Button>
        </div>

        {upcoming.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            No upcoming sessions.{" "}
            <Link href="/portal/book" className="underline underline-offset-2">
              Book one now.
            </Link>
          </div>
        ) : (
          <ul className="divide-y">
            {upcoming.map((appt) => (
              <li key={appt.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {format(appt.startTime, "EEEE d MMMM yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(appt.startTime, "HH:mm")} – {format(appt.endTime, "HH:mm")}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANTS[appt.status]}>
                  {appt.status.charAt(0) + appt.status.slice(1).toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent shared documents */}
      {recentDocs.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents from your practitioner
            </h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              render={<Link href="/portal/documents" />}
            >
              View all
            </Button>
          </div>
          <ul className="divide-y">
            {recentDocs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(doc.createdAt, "d MMM yyyy")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  render={<a href={doc.url} target="_blank" rel="noopener noreferrer" />}
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
