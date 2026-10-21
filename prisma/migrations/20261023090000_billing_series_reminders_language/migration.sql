-- GST/QST rates and tax lines, invoice sent date, statements, recurring series,
-- session reminders, practice language; tax rates widened to 3 decimals (QST 9.975 %)


-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "seriesId" TEXT,
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(6,3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "taxLines" JSONB,
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(6,3);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "gstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN     "qstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "sessionRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(6,3);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "publicToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Statement_publicToken_key" ON "Statement"("publicToken");

-- CreateIndex
CREATE INDEX "Statement_patientId_idx" ON "Statement"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_seriesId_idx" ON "Appointment"("seriesId");

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: invoices already sent (or overdue) count as sent at their last update
UPDATE "Invoice" SET "sentAt" = "updatedAt" WHERE "status" IN ('SENT', 'OVERDUE') AND "sentAt" IS NULL;
