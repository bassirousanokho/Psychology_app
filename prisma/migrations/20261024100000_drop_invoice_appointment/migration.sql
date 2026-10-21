-- Invoices created by the previous code after the last migration: link their
-- session and give them their line, then drop the old one-to-one column.
UPDATE "Appointment" a SET "invoiceId" = i."id"
FROM "Invoice" i
WHERE i."appointmentId" = a."id" AND a."invoiceId" IS NULL AND i."status"::text <> 'CANCELLED';

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
) l ON true
WHERE NOT EXISTS (SELECT 1 FROM "InvoiceLine" il WHERE il."invoiceId" = i."id");

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_appointmentId_fkey";

-- DropIndex
DROP INDEX "Invoice_appointmentId_key";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "appointmentId";
