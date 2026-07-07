-- Live streaming product fields
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "livekit_ingress_id" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "ingress_type" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "ingest_url" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "stream_key" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "hls_url" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "dvr_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "low_latency" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "moderation_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "chat_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "viewer_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "gift_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "super_chat_amount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'message';
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "moderated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "LiveSession_status_visibility_started_at_idx" ON "LiveSession"("status", "visibility", "started_at");
CREATE INDEX IF NOT EXISTS "LiveSession_host_user_id_status_idx" ON "LiveSession"("host_user_id", "status");
CREATE INDEX IF NOT EXISTS "ChatMessage_session_id_created_at_idx" ON "ChatMessage"("session_id", "created_at");
