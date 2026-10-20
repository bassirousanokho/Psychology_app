-- Invoice numbers are sequential per practitioner (workspace), not globally unique
DROP INDEX "Invoice_invoiceNumber_key";

CREATE UNIQUE INDEX "Invoice_workspaceId_invoiceNumber_key" ON "Invoice"("workspaceId", "invoiceNumber");
