-- Soft delete for patients ("Recently deleted" until restored or permanently deleted)
ALTER TABLE "Patient" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Patient_workspaceId_deletedAt_idx" ON "Patient"("workspaceId", "deletedAt");
