-- Conference: hourly billable work with its own rate
-- AlterEnum
ALTER TYPE "SessionType" ADD VALUE 'CONFERENCE';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "hourlyRateConference" DECIMAL(10,2) NOT NULL DEFAULT 0;

