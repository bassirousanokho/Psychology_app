-- Practice region (Canada — Québec by default), Québec registration fields, Canadian defaults


-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "neq" TEXT,
ADD COLUMN     "permitNumber" TEXT,
ADD COLUMN     "qstNumber" TEXT,
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'CA-QC',
ALTER COLUMN "currency" SET DEFAULT 'CAD',
ALTER COLUMN "paymentTerms" SET DEFAULT 'Paiement exigible le jour de la séance.',
ALTER COLUMN "vatMention" SET DEFAULT 'Services de psychothérapie exonérés de TPS et de TVQ.';


-- Existing practices move to the new default: CAD, and Québec wording where the
-- French defaults were never edited
UPDATE "Workspace" SET "currency" = 'CAD' WHERE "region" = 'CA-QC' AND "currency" = 'EUR';
UPDATE "Workspace" SET "vatMention" = 'Services de psychothérapie exonérés de TPS et de TVQ.'
  WHERE "region" = 'CA-QC' AND "vatMention" = 'TVA non applicable, art. 261-4-1° du CGI';
UPDATE "Workspace" SET "paymentTerms" = 'Paiement exigible le jour de la séance.'
  WHERE "region" = 'CA-QC' AND "paymentTerms" = 'Paiement à réception, le jour de la séance.';
