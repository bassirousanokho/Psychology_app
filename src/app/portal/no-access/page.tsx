import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrowserI18n } from "@/i18n/server";

export default async function NoAccessPage() {
  // Not linked to any practice, so the browser's language
  const { t } = await getBrowserI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-6">
      <ShieldOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{t("noAccess.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("noAccess.body")}</p>
      <Button variant="outline" render={<Link href="/portal/sign-in" />}>
        {t("noAccess.signOut")}
      </Button>
    </div>
  );
}
