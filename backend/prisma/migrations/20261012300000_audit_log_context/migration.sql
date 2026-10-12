-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "event" VARCHAR(24) NOT NULL DEFAULT 'UPDATED',
ADD COLUMN     "subjectType" VARCHAR(32),
ADD COLUMN     "before" JSONB,
ADD COLUMN     "after" JSONB,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "browser" VARCHAR(64),
ADD COLUMN     "platform" VARCHAR(64),
ADD COLUMN     "device" VARCHAR(16),
ADD COLUMN     "method" VARCHAR(8),
ADD COLUMN     "url" TEXT,
ALTER COLUMN "ip" SET DATA TYPE VARCHAR(64);

-- rows written before this change only had an action name; derive their event from it
UPDATE "audit_logs" SET "event" = CASE
    WHEN "action" = 'auth.login' THEN 'LOGIN'
    WHEN "action" = 'auth.logout' THEN 'LOGOUT'
    WHEN "action" LIKE 'export.%' THEN 'EXPORTED'
    WHEN "action" LIKE 'import.%' THEN 'IMPORTED'
    WHEN "action" LIKE '%.view_letter' THEN 'VIEWED'
    WHEN "action" LIKE '%.delete' THEN 'DELETED'
    WHEN "action" LIKE '%.create' OR "action" = 'donor.register' OR "action" = 'transfer.request' THEN 'CREATED'
    ELSE 'UPDATED'
END;

-- CreateIndex
CREATE INDEX "audit_logs_event_createdAt_idx" ON "audit_logs"("event", "createdAt");
