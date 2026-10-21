import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { FormBuilder } from "@/components/forms/form-builder";
import { getI18n } from "@/i18n/server";
import { newFieldId } from "@/lib/forms";

export default async function NewFormPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { t } = await getI18n(userId);
  return (
    <>
      <Header title={t("forms.new")} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href="/dashboard/forms" />}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("nav.forms")}
          </Button>
          <FormBuilder
            initial={{
              name: "",
              kind: "QUESTIONNAIRE",
              description: "",
              requiresSignature: false,
              fields: [{ id: newFieldId(), type: "textarea", label: "" }],
            }}
          />
        </div>
      </main>
    </>
  );
}
