import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import prisma from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [workspace, pendingNotes] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    prisma.appointment.count({
      where: {
        workspaceId: userId,
        endTime: { lt: new Date() },
        noteCompletedAt: null,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    }),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspace?.name ?? "My practice"}
        pendingNotes={pendingNotes}
      />
      <SidebarInset className="flex flex-col min-h-screen">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
