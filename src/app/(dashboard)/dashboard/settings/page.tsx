import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const workspace = await prisma.workspace.findUnique({
    where: { id: userId },
    select: {
      defaultTariff: true,
      hourlyRateAdmin: true,
      hourlyRateWriting: true,
      cancellationNoticeHours: true,
      cancellationAlertThreshold: true,
      retentionYears: true,
      taxRate: true,
      currency: true,
      workingHoursStart: true,
      workingHoursEnd: true,
      workingDays: true,
    },
  });

  if (!workspace) redirect("/dashboard");

  const defaults = {
    hourlyRateAdmin: Number(workspace.hourlyRateAdmin),
    hourlyRateWriting: Number(workspace.hourlyRateWriting),
    cancellationNoticeHours: workspace.cancellationNoticeHours,
    cancellationAlertThreshold: workspace.cancellationAlertThreshold,
    retentionYears: workspace.retentionYears,
    taxRate: Number(workspace.taxRate),
    currency: workspace.currency,
    workingHoursStart: workspace.workingHoursStart,
    workingHoursEnd: workspace.workingHoursEnd,
    workingDays: workspace.workingDays,
  };

  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <SettingsForm
            defaults={defaults}
            practiceRate={Number(workspace.defaultTariff)}
          />
        </div>
      </main>
    </>
  );
}
