-- Session types, hourly work, cancellations, patient contacts, rate changes, receipts, retention


-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('PSYCHOTHERAPY', 'ADMIN', 'WRITING');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancellationFee" DECIMAL(10,2),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "hourlyRate" DECIMAL(10,2),
ADD COLUMN     "type" "SessionType" NOT NULL DEFAULT 'PSYCHOTHERAPY';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "isSessionNote" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "receiptSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "doctorName" TEXT,
ADD COLUMN     "doctorPhone" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelation" TEXT,
ADD COLUMN     "tariff" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "cancellationAlertThreshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "cancellationNoticeHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "hourlyRateAdmin" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hourlyRateWriting" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "retentionYears" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "PatientRateChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "previousAmount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientRateChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientRateChange_workspaceId_notifiedAt_idx" ON "PatientRateChange"("workspaceId", "notifiedAt");

-- CreateIndex
CREATE INDEX "PatientRateChange_patientId_effectiveFrom_idx" ON "PatientRateChange"("patientId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "PatientRateChange" ADD CONSTRAINT "PatientRateChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRateChange" ADD CONSTRAINT "PatientRateChange_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: sessions cancelled before cancelledAt existed count from their last update
UPDATE "Appointment" SET "cancelledAt" = "updatedAt" WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NULL;
