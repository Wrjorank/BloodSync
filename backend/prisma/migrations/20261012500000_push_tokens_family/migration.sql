-- AlterTable
ALTER TABLE "push_tokens" ADD COLUMN     "phone" VARCHAR(20);

-- CreateIndex
CREATE INDEX "push_tokens_phone_idx" ON "push_tokens"("phone");
