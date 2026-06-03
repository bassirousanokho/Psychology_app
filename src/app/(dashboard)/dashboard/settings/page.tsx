import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const workspace = await prisma.workspace.findUnique({
    where: { id: userId },
    select: {
      defaultTariff: true,
      taxRate: true,
      currency: true,
      workingHoursStart: true,
      workingHoursEnd: true,
      workingDays: true,
    },
  });

  if (!workspace) redirect("/dashboard");

  const defaults = {
    defaultTariff: Number(workspace.defaultTariff),
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
          <SettingsForm defaults={defaults} />
        </div>
      </main>
    </>
  );
}
