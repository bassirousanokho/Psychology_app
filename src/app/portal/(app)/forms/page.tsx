import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requirePatientAuth } from "@/lib/patient-auth";
import { portalI18n } from "@/i18n/server";
import prisma from "@/lib/prisma";
import { linkExpired } from "@/lib/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function PortalFormsPage() {
  const session = await requirePatientAuth();
  const { t, fmt } = portalI18n(session.workspace);

  const forms = await prisma.formRequest.findMany({
    where: { workspaceId: session.workspaceId, patientId: session.patientId, status: { in: ["PENDING", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, token: true, createdAt: true, completedAt: true, requiresSignature: true },
  });
  const pending = forms.filter((f) => f.status === "PENDING" && !linkExpired(f.createdAt));
  const done = forms.filter((f) => f.status === "COMPLETED");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("portal.forms")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("portal.formsHint")}</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold">{t("portal.formsToFill")}</h2>
        </div>
        {pending.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">{t("portal.noFormsToFill")}</p>
        ) : (
          <ul className="divide-y">
            {pending.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("portal.formSentOn", { date: fmt(f.createdAt, "d MMMM yyyy") })}
                    {f.requiresSignature && ` · ${t("portal.formSignature")}`}
                  </p>
                </div>
                <Button size="sm" render={<Link href={`/form/${f.token}`} />}>
                  {t("portal.fillIn")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <h2 className="font-semibold">{t("portal.formsDone")}</h2>
          </div>
          <ul className="divide-y">
            {done.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                <p className="flex-1 text-sm">{f.name}</p>
                <Badge variant="secondary">
                  {f.completedAt ? t("portal.formDoneOn", { date: fmt(f.completedAt, "d MMM yyyy") }) : t("formStatus.COMPLETED")}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
