import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormLibraryButtons, ArchiveFormButton } from "@/components/forms/form-list-actions";
import prisma from "@/lib/prisma";
import { ensureWorkspace } from "@/lib/workspace";
import { formLibrary } from "@/lib/form-library";
import { getI18n } from "@/i18n/server";

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");
  const showArchived = (await searchParams).archived === "1";

  const [templates, ws] = await Promise.all([
    prisma.formTemplate.findMany({
      where: { workspaceId: userId, archivedAt: showArchived ? { not: null } : null },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { requests: true } },
        requests: { where: { status: "PENDING" }, select: { id: true } },
      },
    }),
    prisma.workspace.findUniqueOrThrow({ where: { id: userId }, select: { region: true } }),
  ]);
  const { t, tp, lang } = await getI18n(userId);
  const names = new Set(
    (await prisma.formTemplate.findMany({ where: { workspaceId: userId }, select: { name: true } })).map((f) => f.name),
  );
  const library = formLibrary(lang, ws.region)
    .filter((f) => !names.has(f.name))
    .map(({ key, name }) => ({ key, name }));

  return (
    <>
      <Header title={t("nav.forms")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="text-sm text-muted-foreground">{t("forms.hint")}</p>

          <div className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <h2 className="font-semibold">{showArchived ? t("forms.archived") : t("forms.yours")}</h2>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" render={<Link href={showArchived ? "/dashboard/forms" : "/dashboard/forms?archived=1"} />}>
                  {showArchived ? t("forms.showActive") : t("forms.showArchived")}
                </Button>
                <Button size="sm" render={<Link href="/dashboard/forms/new" />}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("forms.new")}
                </Button>
              </div>
            </div>
            {templates.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t("forms.empty")}</p>
            ) : (
              <ul className="divide-y">
                {templates.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/forms/${f.id}`} className="text-sm font-medium hover:underline">
                        {f.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t(`formKind.${f.kind}`)}
                        {f.requiresSignature && ` · ${t("forms.signed")}`}
                        {" · "}
                        {tp(f._count.requests, "forms.sentCount")}
                        {f.requests.length > 0 && ` · ${tp(f.requests.length, "forms.pendingCount")}`}
                      </p>
                    </div>
                    {f.kind === "CONSENT" && <Badge variant="secondary">{t("formKind.CONSENT")}</Badge>}
                    <ArchiveFormButton id={f.id} archived={showArchived} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!showArchived && library.length > 0 && (
            <div className="rounded-xl border bg-card px-5 py-4">
              <h2 className="font-semibold">{t("forms.library")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("forms.libraryHint")}</p>
              <FormLibraryButtons items={library} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
