import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Header } from "@/components/layout/header";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { missingLegalDetails } from "@/lib/invoice-legal";
import { ensureWorkspace } from "@/lib/workspace";
import { BillingTable, type InvoiceRow } from "@/components/billing/billing-table";
import { StatCard } from "@/components/billing/stat-card";

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await ensureWorkspace(userId))) redirect("/portal/dashboard");

  const workspace = await prisma.workspace.findUnique({
    where: { id: userId },
    select: {
      currency: true,
      region: true,
      address: true,
      vatMention: true,
      permitNumber: true,
      neq: true,
      gstNumber: true,
      qstNumber: true,
      siret: true,
      adeli: true,
      rpps: true,
    },
  });
  const missingLegal = workspace ? missingLegalDetails(workspace) : [];
  const currency = workspace?.currency ?? "EUR";

  const [invoices, stats] = await Promise.all([
    prisma.invoice.findMany({
      where: { workspaceId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { workspaceId: userId },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const statMap = Object.fromEntries(
    stats.map((s) => [s.status, { sum: Number(s._sum.totalAmount ?? 0), count: s._count }])
  );

  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    patientName: `${inv.patient.lastName}, ${inv.patient.firstName}`,
    totalAmount: Number(inv.totalAmount),
    status: inv.status as InvoiceRow["status"],
    dueDate: inv.dueDate.toISOString(),
    paidAt: inv.paidAt?.toISOString() ?? null,
    receiptSentAt: inv.receiptSentAt?.toISOString() ?? null,
    publicToken: inv.publicToken,
  }));

  const revenue = statMap["PAID"]?.sum ?? 0;
  const outstanding = (statMap["SENT"]?.sum ?? 0) + (statMap["DRAFT"]?.sum ?? 0);
  const overdue = statMap["OVERDUE"]?.sum ?? 0;
  const totalInvoices = Object.values(statMap).reduce((acc, v) => acc + v.count, 0);

  return (
    <>
      <Header title="Billing" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-6">

          {missingLegal.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p>
                Your invoices are missing required legal details: {missingLegal.join(", ")}.
              </p>
              <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
                Complete in Settings
              </Link>
            </div>
          )}

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total invoices"
              value={String(totalInvoices)}
            />
            <StatCard
              label="Revenue collected"
              value={`${revenue.toFixed(2)} ${currency}`}
              highlight="green"
            />
            <StatCard
              label="Outstanding"
              value={`${outstanding.toFixed(2)} ${currency}`}
            />
            <StatCard
              label="Overdue"
              value={`${overdue.toFixed(2)} ${currency}`}
              highlight={overdue > 0 ? "red" : undefined}
            />
          </div>

          {/* Invoice table */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="font-semibold">Invoices</h2>
            </div>
            <BillingTable rows={rows} currency={currency} />
          </div>

        </div>
      </main>
    </>
  );
}
