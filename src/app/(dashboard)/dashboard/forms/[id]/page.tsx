import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { FormBuilder } from "@/components/forms/form-builder";
import prisma from "@/lib/prisma";
import { parseFields } from "@/lib/forms";
import { getI18n } from "@/i18n/server";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const form = await prisma.formTemplate.findFirst({ where: { id, workspaceId: userId } });
  if (!form) notFound();
  const { t } = await getI18n(userId);

  return (
    <>
      <Header title={form.name} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href="/dashboard/forms" />}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("nav.forms")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("formBuilder.sentCopies")}</p>
          <FormBuilder
            initial={{
              id: form.id,
              name: form.name,
              kind: form.kind,
              description: form.description ?? "",
              requiresSignature: form.requiresSignature,
              fields: parseFields(form.fields),
            }}
          />
        </div>
      </main>
    </>
  );
}
