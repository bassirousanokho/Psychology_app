import Link from "next/link";

import { ExternalLink } from "lucide-react";
import { requirePatientAuth } from "@/lib/patient-auth";
import { portalI18n } from "@/i18n/server";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_VARIANTS = {
  DRAFT:   "secondary",
  SENT:    "default",
  PAID:    "default",
  OVERDUE: "destructive",
} as const;

export default async function PortalInvoicesPage() {
  const session = await requirePatientAuth();
  const { t, tp, fmt, money } = portalI18n(session.workspace);

  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: session.workspaceId,
      patientId: session.patientId,
      status: { in: ["SENT", "PAID", "OVERDUE"] }, // don't show DRAFT to patients
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("portal.invoices")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tp(invoices.length, "portal.invoiceCount")}
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        {invoices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">{t("portal.noInvoices")}</p>
        ) : (
          <ul className="divide-y">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {money(Number(inv.totalAmount), session.workspace.currency)} ·{" "}
                    {t("portal.due", { date: fmt(inv.dueDate, "d MMM yyyy") })}
                    {inv.paidAt && t("portal.paidOn", { date: fmt(inv.paidAt, "d MMM yyyy") })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANTS[inv.status]}>
                    {t(`invoiceStatus.${inv.status}`)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    render={
                      <Link
                        href={`/invoice/${inv.publicToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    title={t("portal.viewInvoice")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
