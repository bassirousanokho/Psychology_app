"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  Receipt,
  Settings,
  Stethoscope,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { label: "Overview",       href: "/dashboard",          icon: LayoutDashboard },
  { label: "Calendar",       href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Patients",       href: "/dashboard/patients", icon: Users },
  { label: "Clinical Notes", href: "/dashboard/notes",    icon: FileText, showBadge: true },
  { label: "Billing",        href: "/dashboard/billing",  icon: Receipt },
];

interface AppSidebarProps {
  workspaceName: string;
  pendingNotes?: number;
}

export function AppSidebar({ workspaceName, pendingNotes = 0 }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar>
      {/* Practice name */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold">{workspaceName}</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const badge = item.showBadge && pendingNotes > 0 ? pendingNotes : 0;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={<Link href={item.href} />}
                      className="justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </span>
                      {badge > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                          {badge}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/dashboard/settings")}
                  render={<Link href="/dashboard/settings" />}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <UserButton
          showName
          appearance={{
            elements: {
              rootBox: "w-full",
              userButtonTrigger:
                "w-full justify-start gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              userButtonBox: "flex-row-reverse",
            },
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
