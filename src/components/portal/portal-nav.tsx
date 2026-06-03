"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { CalendarPlus, CalendarDays, FileText, FolderOpen, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/portal/dashboard",     label: "Home",           icon: LayoutDashboard },
  { href: "/portal/book",          label: "Book session",   icon: CalendarPlus },
  { href: "/portal/appointments",  label: "Appointments",   icon: CalendarDays },
  { href: "/portal/invoices",      label: "Invoices",       icon: FileText },
  { href: "/portal/documents",     label: "Documents",      icon: FolderOpen },
];

interface PortalNavProps {
  practiceName: string;
  patientName: string;
}

export function PortalNav({ practiceName, patientName }: PortalNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col border-r bg-card">
      {/* Header */}
      <div className="border-b px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Patient Portal
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
                {label}
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
