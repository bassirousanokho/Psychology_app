"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { CalendarPlus, CalendarDays, ClipboardList, FileText, FolderOpen, LayoutDashboard, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

const NAV_ITEMS = [
  { href: "/portal/dashboard",    label: "portal.nav.home",         icon: LayoutDashboard },
  { href: "/portal/book",         label: "portal.nav.book",         icon: CalendarPlus },
  { href: "/portal/appointments", label: "portal.nav.appointments", icon: CalendarDays },
  { href: "/portal/messages",     label: "portal.nav.messages",     icon: MessageSquare },
  { href: "/portal/invoices",     label: "portal.nav.invoices",     icon: FileText },
  { href: "/portal/forms",        label: "portal.nav.forms",        icon: ClipboardList },
  { href: "/portal/documents",    label: "portal.nav.documents",    icon: FolderOpen },
] as const;

interface PortalNavProps {
  practiceName: string;
  patientName: string;
  unreadMessages?: number;
}

export function PortalNav({ practiceName, patientName, unreadMessages = 0 }: PortalNavProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="flex h-full flex-col border-r bg-card">
      {/* Header */}
      <div className="border-b px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("portal.title")}
        </p>
        <p className="mt-0.5 truncate font-semibold text-sm">{practiceName}</p>
      </div>

      {/* Nav links */}
      <ul className="flex-1 space-y-0.5 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t(label)}</span>
                {href === "/portal/messages" && unreadMessages > 0 && (
                  <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">{unreadMessages}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="border-t px-4 py-3 flex items-center gap-3">
        <UserButton />
        <p className="text-sm text-muted-foreground truncate">{patientName}</p>
      </div>
    </nav>
  );
}

/** Phones: the same links as a scrollable bar at the top. */
export function PortalMobileNav({ practiceName, unreadMessages = 0 }: { practiceName: string; unreadMessages?: number }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <div className="border-b bg-card md:hidden">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="truncate text-sm font-semibold">{practiceName}</p>
        <UserButton />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(label)}
              {href === "/portal/messages" && unreadMessages > 0 && (
                <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">{unreadMessages}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
