ALTER TABLE "Profile" ADD COLUMN "birth_date" TIMESTAMP(3);
ALTER TABLE "View" ADD COLUMN "age_group" TEXT;
CREATE INDEX "View_video_id_age_group_qualified_idx" ON "View"("video_id", "age_group", "qualified");

ALTER TABLE "MonetizationAccount"
ADD COLUMN "estimated_balance_paise" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "lifetime_earnings_paise" BIGINT NOT NULL DEFAULT 0;
