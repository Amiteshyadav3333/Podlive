ALTER TABLE "View"
ADD COLUMN "session_key" TEXT,
ADD COLUMN "qualified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "View_session_key_key" ON "View"("session_key");
CREATE INDEX "View_video_id_qualified_created_at_idx" ON "View"("video_id", "qualified", "created_at");

CREATE TABLE "MonetizationAccount" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ineligible',
    "followers_snapshot" INTEGER NOT NULL DEFAULT 0,
    "watch_seconds_snapshot" BIGINT NOT NULL DEFAULT 0,
    "eligible_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "suspension_reason" TEXT,
    "last_evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonetizationAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonetizationAccount_user_id_key" ON "MonetizationAccount"("user_id");
CREATE INDEX "MonetizationAccount_status_last_evaluated_at_idx" ON "MonetizationAccount"("status", "last_evaluated_at");
ALTER TABLE "MonetizationAccount" ADD CONSTRAINT "MonetizationAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
