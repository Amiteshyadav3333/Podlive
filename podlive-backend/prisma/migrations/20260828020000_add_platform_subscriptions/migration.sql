CREATE TABLE "PlatformSubscription" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "plan_code" TEXT NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "upi_reference" TEXT,
  "provider_payment_id" TEXT,
  "starts_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformSubscription_user_id_status_expires_at_idx" ON "PlatformSubscription"("user_id", "status", "expires_at");
CREATE INDEX "PlatformSubscription_upi_reference_idx" ON "PlatformSubscription"("upi_reference");
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
