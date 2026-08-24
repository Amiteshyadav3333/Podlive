CREATE TABLE "Channel" (
  "id" TEXT NOT NULL, "owner_id" TEXT NOT NULL, "name" TEXT NOT NULL, "handle" TEXT NOT NULL,
  "description" TEXT, "avatar_url" TEXT, "banner_url" TEXT, "trailer_video_id" TEXT,
  "primary_color" TEXT NOT NULL DEFAULT '#7C3AED', "accent_color" TEXT NOT NULL DEFAULT '#EC4899',
  "layout" JSONB, "social_links" JSONB, "membership_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Channel_owner_id_key" ON "Channel"("owner_id");
CREATE UNIQUE INDEX "Channel_handle_key" ON "Channel"("handle");
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VideoAccessGrant" (
  "id" TEXT NOT NULL, "video_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "granted_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMP(3),
  CONSTRAINT "VideoAccessGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VideoAccessGrant_video_id_user_id_key" ON "VideoAccessGrant"("video_id", "user_id");
CREATE INDEX "VideoAccessGrant_user_id_expires_at_idx" ON "VideoAccessGrant"("user_id", "expires_at");
ALTER TABLE "VideoAccessGrant" ADD CONSTRAINT "VideoAccessGrant_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoAccessGrant" ADD CONSTRAINT "VideoAccessGrant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LiveAccessInvite" (
  "id" TEXT NOT NULL, "session_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL, "created_by" TEXT NOT NULL,
  "allowed_user_id" TEXT, "redeemed_by" TEXT, "max_uses" INTEGER NOT NULL DEFAULT 1, "use_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveAccessInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveAccessInvite_token_hash_key" ON "LiveAccessInvite"("token_hash");
CREATE INDEX "LiveAccessInvite_session_id_revoked_at_idx" ON "LiveAccessInvite"("session_id", "revoked_at");
ALTER TABLE "LiveAccessInvite" ADD CONSTRAINT "LiveAccessInvite_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveAccessInvite" ADD CONSTRAINT "LiveAccessInvite_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveAccessInvite" ADD CONSTRAINT "LiveAccessInvite_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MembershipTier" (
  "id" TEXT NOT NULL, "channel_id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "price_amount" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'INR', "billing_period" TEXT NOT NULL DEFAULT 'monthly',
  "benefits" JSONB, "badge_url" TEXT, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MembershipTier_channel_id_is_active_idx" ON "MembershipTier"("channel_id", "is_active");
ALTER TABLE "MembershipTier" ADD CONSTRAINT "MembershipTier_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChannelMembership" (
  "id" TEXT NOT NULL, "channel_id" TEXT NOT NULL, "tier_id" TEXT NOT NULL, "member_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active', "provider" TEXT, "provider_reference" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "renews_at" TIMESTAMP(3), "ended_at" TIMESTAMP(3),
  CONSTRAINT "ChannelMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChannelMembership_channel_id_member_id_key" ON "ChannelMembership"("channel_id", "member_id");
CREATE INDEX "ChannelMembership_member_id_status_idx" ON "ChannelMembership"("member_id", "status");
ALTER TABLE "ChannelMembership" ADD CONSTRAINT "ChannelMembership_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelMembership" ADD CONSTRAINT "ChannelMembership_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "MembershipTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelMembership" ADD CONSTRAINT "ChannelMembership_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
