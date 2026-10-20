-- Invoice legal mentions and header/footer images, patient address, messages to patients


-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED', 'NOT_CONFIGURED');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "address" TEXT,
ADD COLUMN     "adeli" TEXT,
ADD COLUMN     "invoiceFooterKey" TEXT,
ADD COLUMN     "invoiceHeaderKey" TEXT,
ADD COLUMN     "invoiceNotes" TEXT,
ADD COLUMN     "paymentTerms" TEXT DEFAULT 'Paiement à réception, le jour de la séance.',
ADD COLUMN     "practitionerName" TEXT,
ADD COLUMN     "professionalTitle" TEXT DEFAULT 'Psychologue',
ADD COLUMN     "rpps" TEXT,
ADD COLUMN     "siret" TEXT,
ADD COLUMN     "vatMention" TEXT DEFAULT 'TVA non applicable, art. 261-4-1° du CGI';

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_patientId_createdAt_idx" ON "Message"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_workspaceId_idx" ON "Message"("workspaceId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

