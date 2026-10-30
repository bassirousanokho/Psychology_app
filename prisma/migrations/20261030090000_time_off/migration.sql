-- Time off: whole days without therapy sessions
-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeOff_workspaceId_endDate_idx" ON "TimeOff"("workspaceId", "endDate");

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

