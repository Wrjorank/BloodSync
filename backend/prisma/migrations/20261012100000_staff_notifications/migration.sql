-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "faskesId" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "view" VARCHAR(16) NOT NULL,
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_faskesId_createdAt_idx" ON "notifications"("faskesId", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_faskesId_fkey" FOREIGN KEY ("faskesId") REFERENCES "faskes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
