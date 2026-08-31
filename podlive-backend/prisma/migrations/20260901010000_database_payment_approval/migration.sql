ALTER TABLE "PlatformSubscription"
  ADD COLUMN "payment_submitted_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by" TEXT,
  ADD COLUMN "review_note" TEXT;

-- Admin-only database review queue. Do not expose this view through a public API.
CREATE VIEW "PlatformPaymentReviewQueue" AS
SELECT
  ps."id" AS "order_id",
  ps."plan_code",
  ps."amount_paise",
  ps."currency",
  ps."upi_reference" AS "transaction_reference",
  ps."payment_submitted_at",
  ps."created_at",
  u."id" AS "user_id",
  u."display_name",
  u."unique_handle",
  u."email"
FROM "PlatformSubscription" ps
JOIN "User" u ON u."id" = ps."user_id"
WHERE ps."status" = 'verification_pending';

-- Run only from the administrator's database console. This is deliberately not
-- granted to the application's database role or to any public API role.
CREATE OR REPLACE FUNCTION public.approve_platform_subscription(
  p_order_id TEXT,
  p_reviewer TEXT DEFAULT 'database_admin',
  p_note TEXT DEFAULT NULL
)
RETURNS "PlatformSubscription"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved "PlatformSubscription";
BEGIN
  UPDATE "PlatformSubscription"
  SET
    "status" = 'active',
    "provider_payment_id" = "upi_reference",
    "starts_at" = CURRENT_TIMESTAMP,
    "expires_at" = CURRENT_TIMESTAMP + CASE "plan_code"
      WHEN 'plus' THEN INTERVAL '30 days'
      WHEN 'max' THEN INTERVAL '30 days'
      ELSE INTERVAL '30 days'
    END,
    "reviewed_at" = CURRENT_TIMESTAMP,
    "reviewed_by" = LEFT(COALESCE(NULLIF(TRIM(p_reviewer), ''), 'database_admin'), 100),
    "review_note" = NULLIF(LEFT(TRIM(COALESCE(p_note, '')), 500), ''),
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_order_id
    AND "status" = 'verification_pending'
    AND "upi_reference" IS NOT NULL
  RETURNING * INTO approved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request % is missing, already reviewed, or has no transaction reference', p_order_id;
  END IF;
  RETURN approved;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_platform_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reject_platform_subscription(
  p_order_id TEXT,
  p_reviewer TEXT DEFAULT 'database_admin',
  p_note TEXT DEFAULT NULL
)
RETURNS "PlatformSubscription"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rejected "PlatformSubscription";
BEGIN
  UPDATE "PlatformSubscription"
  SET
    "status" = 'rejected',
    "reviewed_at" = CURRENT_TIMESTAMP,
    "reviewed_by" = LEFT(COALESCE(NULLIF(TRIM(p_reviewer), ''), 'database_admin'), 100),
    "review_note" = NULLIF(LEFT(TRIM(COALESCE(p_note, '')), 500), ''),
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_order_id AND "status" = 'verification_pending'
  RETURNING * INTO rejected;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request % is missing or already reviewed', p_order_id;
  END IF;
  RETURN rejected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_platform_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
