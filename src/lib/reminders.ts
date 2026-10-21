import { subDays, subYears } from "date-fns";
import prisma from "@/lib/prisma";
import { ALERT_WINDOW_DAYS } from "@/lib/cancellations";
import { langOf, localeOf } from "@/lib/format";
import type { RemindersData } from "@/components/dashboard/reminders";

const MAX_PER_SECTION = 20;

/** Everything the practitioner should act on: rate announcements, cancellation alerts, retention reviews. */
export async function getReminders(workspaceId: string): Promise<RemindersData> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { currency: true, region: true, language: true, retentionYears: true, cancellationAlertThreshold: true },
  });
  const now = new Date();
  const retentionCutoff = subYears(now, workspace.retentionYears);
  const name = (p: { firstName: string; lastName: string }) => `${p.lastName}, ${p.firstName}`;

  const [rateChanges, cancellationCounts, inactive, deleted] = await Promise.all([
    prisma.patientRateChange.findMany({
      where: { workspaceId, notifiedAt: null, patient: { deletedAt: null } },
      orderBy: { effectiveFrom: "asc" },
      take: MAX_PER_SECTION,
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: {
        workspaceId,
        status: "CANCELLED",
        cancelledAt: { gte: subDays(now, ALERT_WINDOW_DAYS) },
        patient: { deletedAt: null },
      },
      _count: { _all: true },
    }),
    // Active patients with no session in the retention period (and older than it)
    prisma.patient.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        createdAt: { lt: retentionCutoff },
        appointments: { none: { startTime: { gte: retentionCutoff } } },
      },
      take: MAX_PER_SECTION,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        appointments: { orderBy: { startTime: "desc" }, take: 1, select: { startTime: true } },
      },
    }),
    prisma.patient.findMany({
      where: { workspaceId, deletedAt: { lt: retentionCutoff } },
      orderBy: { deletedAt: "asc" },
      take: MAX_PER_SECTION,
      select: { id: true, firstName: true, lastName: true, deletedAt: true },
    }),
  ]);

  const flagged = cancellationCounts.filter((c) => c._count._all >= workspace.cancellationAlertThreshold);
  const flaggedPatients = await prisma.patient.findMany({
    where: { id: { in: flagged.map((c) => c.patientId) } },
    select: { id: true, firstName: true, lastName: true },
  });

  return {
    currency: workspace.currency,
    locale: localeOf(langOf(workspace.language), workspace.region),
    retentionYears: workspace.retentionYears,
    cancellationThreshold: workspace.cancellationAlertThreshold,
    rateChanges: rateChanges.map((c) => ({
      id: c.id,
      patientId: c.patientId,
      patientName: name(c.patient),
      previousAmount: Number(c.previousAmount),
      amount: Number(c.amount),
      effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
    })),
    cancellationAlerts: flaggedPatients
      .map((p) => ({
        patientId: p.id,
        patientName: name(p),
        count: flagged.find((c) => c.patientId === p.id)!._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    inactivePatients: inactive.map((p) => ({
      patientId: p.id,
      patientName: name(p),
      lastActivity: (p.appointments[0]?.startTime ?? p.createdAt).toISOString(),
    })),
    deletedPatients: deleted.map((p) => ({
      patientId: p.id,
      patientName: name(p),
      deletedAt: p.deletedAt!.toISOString(),
    })),
  };
}
