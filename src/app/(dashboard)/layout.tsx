import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { I18nProvider } from "@/i18n/client";
import { toLang, translate } from "@/i18n/core";
import { localeOf } from "@/lib/format";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Patient accounts belong in the portal, never in the practitioner dashboard
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const [workspace, pendingNotes] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: userId },
      select: { name: true, language: true, region: true },
    }),
    prisma.appointment.count({
      where: {
        workspaceId: userId,
        endTime: { lt: new Date() },
        noteCompletedAt: null,
        type: "PSYCHOTHERAPY", // notes are optional for hourly work
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    }),
  ]);

  const lang = toLang(workspace?.language);
  return (
    <I18nProvider lang={lang} locale={localeOf(lang, workspace?.region)}>
      <SidebarProvider>
        <AppSidebar
          workspaceName={workspace?.name ?? translate(lang, "nav.myPractice")}
          pendingNotes={pendingNotes}
        />
        <SidebarInset className="flex flex-col min-h-screen" lang={lang}>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </I18nProvider>
  );
}
