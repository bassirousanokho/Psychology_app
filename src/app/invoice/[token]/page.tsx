import { notFound } from "next/navigation";
import { format } from "date-fns";
import prisma from "@/lib/prisma";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicInvoicePage({ params }: PageProps) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      workspace: { select: { name: true, currency: true } },
      appointment: { select: { startTime: true } },
    },
  });

  if (!invoice) notFound();

  const { patient, workspace, appointment } = invoice;
  const amount = Number(invoice.amount);
  const taxAmount = Number(invoice.taxAmount);
  const totalAmount = Number(invoice.totalAmount);
  const taxRate = Number(invoice.taxRate);
  const cur = workspace.currency;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border p-8 print:shadow-none print:border-none">

        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Invoice</p>
            <p className="text-lg font-mono font-semibold">{invoice.invoiceNumber}</p>
          </div>
        </div>

        {/* Patient & dates */}
        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Bill to</p>
            <p className="font-semibold text-gray-900">
              {patient.firstName} {patient.lastName}
            </p>
            {patient.email && <p className="text-gray-500">{patient.email}</p>}
          </div>
          <div className="text-right">
            <div className="space-y-0.5">
              <div className="flex justify-between gap-8">
                <span className="text-gray-400">Issue date</span>
                <span>{format(invoice.createdAt, "d MMM yyyy")}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-gray-400">Due date</span>
                <span>{format(invoice.dueDate, "d MMM yyyy")}</span>
              </div>
              {appointment && (
                <div className="flex justify-between gap-8">
                  <span className="text-gray-400">Session date</span>
                  <span>{format(appointment.startTime, "d MMM yyyy")}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b text-left text-xs text-gray-400 uppercase tracking-wide">
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3 text-gray-900">
                Therapy session
                {appointment && ` — ${format(appointment.startTime, "d MMMM yyyy")}`}
              </td>
              <td className="py-3 text-right tabular-nums">
                {amount.toFixed(2)} {cur}
              </td>
            </tr>
          </tbody>
          <tfoot>
            {taxRate > 0 && (
              <tr>
                <td className="pt-3 text-right text-gray-400 pr-8" colSpan={1}>
                  Tax ({taxRate.toFixed(0)}%)
                </td>
                <td className="pt-3 text-right tabular-nums text-gray-400">
                  {taxAmount.toFixed(2)} {cur}
                </td>
              </tr>
            )}
            <tr>
              <td className="pt-2 text-right font-semibold text-gray-900 pr-8" colSpan={1}>
                Total
              </td>
              <td className="pt-2 text-right tabular-nums font-bold text-gray-900">
                {totalAmount.toFixed(2)} {cur}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Status */}
        <div
          className={`text-center rounded-lg py-3 text-sm font-semibold ${
            invoice.status === "PAID"
              ? "bg-green-50 text-green-700"
              : invoice.status === "OVERDUE"
              ? "bg-red-50 text-red-700"
              : "bg-gray-50 text-gray-600"
          }`}
        >
          {invoice.status === "PAID" && invoice.paidAt
            ? `Paid on ${format(invoice.paidAt, "d MMMM yyyy")}`
            : invoice.status === "OVERDUE"
            ? "Payment overdue"
            : "Payment pending"}
        </div>

        {invoice.notes && (
          <p className="mt-6 text-sm text-gray-400 border-t pt-4">{invoice.notes}</p>
        )}

        <div className="mt-8 text-center">
          <button
            onClick={() => window.print()}
            className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 print:hidden"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
