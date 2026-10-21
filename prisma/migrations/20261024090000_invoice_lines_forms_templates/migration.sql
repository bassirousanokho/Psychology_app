-- Invoice lines and credit notes, sessions linked to their invoice (several
-- sessions per invoice), note templates, forms, patient self-service.
-- Additive only: Invoice.appointmentId is dropped by the next migration, once
-- the code reading it is replaced.

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');
CREATE TYPE "FormKind" AS ENUM ('INTAKE', 'CONSENT', 'QUESTIONNAIRE');
CREATE TYPE "FormRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "changedByPatientAt" TIMESTAMP(3),
ADD COLUMN "invoiceId" TEXT;

ALTER TABLE "Invoice" ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "creditedInvoiceId" TEXT,
ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE';

ALTER TABLE "Workspace" ADD COLUMN "patientSelfServiceEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "amount" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- Backfill: each session points to its invoice, and each existing invoice gets
-- one line worded as the invoice page used to print it (practice time zone).
UPDATE "Appointment" a SET "invoiceId" = i."id" FROM "Invoice" i WHERE i."appointmentId" = a."id";

INSERT INTO "InvoiceLine" ("id", "invoiceId", "appointmentId", "position", "description", "quantity", "unitPrice", "taxRate", "amount")
SELECT
  gen_random_uuid()::text,
  i."id",
  a."id",
  0,
  CASE
    WHEN a."id" IS NULL THEN 'Séance de psychothérapie'
    WHEN a."status" = 'CANCELLED' AND a."cancellationFee" IS NOT NULL THEN 'Frais d''annulation — séance du ' || l.d
    WHEN a."type" = 'ADMIN' THEN 'Travail administratif — ' || l.d || ' (' || l.dur || ')'
    WHEN a."type" = 'WRITING' THEN 'Rédaction de compte rendu — ' || l.d || ' (' || l.dur || ')'
    ELSE 'Séance de psychothérapie — ' || l.d
  END,
  1,
  i."amount",
  i."taxRate",
  i."amount"
FROM "Invoice" i
LEFT JOIN "Appointment" a ON a."id" = i."appointmentId"
LEFT JOIN LATERAL (
  SELECT
    EXTRACT(DAY FROM t)::int || ' ' ||
      (ARRAY['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[EXTRACT(MONTH FROM t)::int]
      || ' ' || EXTRACT(YEAR FROM t)::int AS d,
    CASE
      WHEN m < 60 THEN m || ' min'
      WHEN m % 60 = 0 THEN (m / 60) || ' h'
      ELSE (m / 60) || ' h ' || (m % 60)
    END AS dur
  FROM (
    SELECT
      (a."startTime" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Toronto' AS t,
      ROUND(EXTRACT(EPOCH FROM (a."endTime" - a."startTime")) / 60)::int AS m
  ) x
) l ON true;

-- CreateTable
CREATE TABLE "NoteTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NoteTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FormKind" NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "FormKind" NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "requiresSignature" BOOLEAN NOT NULL,
    "token" TEXT NOT NULL,
    "status" "FormRequestStatus" NOT NULL DEFAULT 'PENDING',
    "answers" TEXT,
    "signatureName" TEXT,
    "signedAt" TIMESTAMP(3),
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX "InvoiceLine_appointmentId_idx" ON "InvoiceLine"("appointmentId");
CREATE INDEX "NoteTemplate_workspaceId_idx" ON "NoteTemplate"("workspaceId");
CREATE INDEX "FormTemplate_workspaceId_idx" ON "FormTemplate"("workspaceId");
CREATE UNIQUE INDEX "FormRequest_token_key" ON "FormRequest"("token");
CREATE INDEX "FormRequest_workspaceId_idx" ON "FormRequest"("workspaceId");
CREATE INDEX "FormRequest_patientId_idx" ON "FormRequest"("patientId");
CREATE INDEX "Appointment_invoiceId_idx" ON "Appointment"("invoiceId");
CREATE UNIQUE INDEX "Invoice_creditedInvoiceId_key" ON "Invoice"("creditedInvoiceId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditedInvoiceId_fkey" FOREIGN KEY ("creditedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoteTemplate" ADD CONSTRAINT "NoteTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
