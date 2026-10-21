-- Inbox: two-way messages with attachments, private link for patients without
-- a portal account, activity feed. Additive only.
-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('TO_PATIENT', 'FROM_PATIENT');

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "uploadedByPatient" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "direction" "MessageDirection" NOT NULL DEFAULT 'TO_PATIENT',
ADD COLUMN     "readAt" TIMESTAMP(3),
ALTER COLUMN "senderId" DROP NOT NULL,
ALTER COLUMN "toEmail" DROP NOT NULL,
ALTER COLUMN "subject" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "inboxFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inboxLockedUntil" TIMESTAMP(3),
ADD COLUMN     "inboxToken" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "patientCanWriteFirst" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "practitionerEmailNotices" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "patientId" TEXT,
    "appointmentId" TEXT,
    "formRequestId" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_workspaceId_createdAt_idx" ON "Activity"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_readAt_idx" ON "Activity"("workspaceId", "readAt");

-- CreateIndex
CREATE INDEX "Document_messageId_idx" ON "Document"("messageId");

-- CreateIndex
CREATE INDEX "Message_workspaceId_direction_readAt_idx" ON "Message"("workspaceId", "direction", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_inboxToken_key" ON "Patient"("inboxToken");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Messages sent by email before the inbox count as read
UPDATE "Message" SET "readAt" = "createdAt" WHERE "readAt" IS NULL;
