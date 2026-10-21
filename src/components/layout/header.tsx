"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const { t } = useI18n();

  // Search from any page: Enter opens the patient list filtered by the query
  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
    router.push(q ? `/dashboard/patients?q=${encodeURIComponent(q)}` : "/dashboard/patients");
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <h1 className="text-base font-semibold">{title}</h1>

      <form onSubmit={handleSearch} className="relative ml-auto hidden sm:block" role="search">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          placeholder={t("header.searchPatients")}
          aria-label={t("header.searchPatients")}
          className="w-64 pl-8 h-8 text-sm"
        />
      </form>
    </header>
  );
}
