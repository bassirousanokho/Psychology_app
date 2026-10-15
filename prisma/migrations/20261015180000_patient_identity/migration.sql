-- Optional identity fields on Patient
ALTER TABLE "Patient" ADD COLUMN "gender" TEXT;
ALTER TABLE "Patient" ADD COLUMN "pronouns" TEXT;
ALTER TABLE "Patient" ALTER COLUMN "dateOfBirth" SET DATA TYPE DATE;
