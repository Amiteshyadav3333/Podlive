ALTER TABLE "LiveSession" ALTER COLUMN "replay_enabled" SET DEFAULT false;

UPDATE "LiveSession"
SET
  "replay_enabled" = false,
  "dvr_enabled" = false,
  "livekit_egress_id" = NULL,
  "hls_url" = NULL,
  "recording_url" = NULL,
  "is_processing" = false
WHERE "status" IN ('live', 'scheduled');
