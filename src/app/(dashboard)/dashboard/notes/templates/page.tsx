import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { NoteTemplatesManager } from "@/components/notes/note-templates-manager";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { noteLibrary } from "@/lib/note-library";
import { getI18n } from "@/i18n/server";

export default async function NoteTemplatesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const templates = await prisma.noteTemplate.findMany({
    where: { workspaceId: userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, body: true },
  });
  const { t, lang } = await getI18n(userId);

  return (
    <>
      <Header title={t("noteTemplates.title")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href="/dashboard/notes" />}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("nav.notes")}
          </Button>
          <NoteTemplatesManager
            templates={templates}
            library={noteLibrary(lang).map(({ key, name }) => ({ key, name }))}
          />
        </div>
      </main>
    </>
  );
}
