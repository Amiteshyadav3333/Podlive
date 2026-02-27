-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unique_handle" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "host_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "livekit_room_name" TEXT,
    "viewer_count_peak" INTEGER NOT NULL DEFAULT 0,
    "recording_url" TEXT,
    "started_at" DATETIME,
    "ended_at" DATETIME,
    "category" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveSession_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "invitee_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" DATETIME,
    "left_at" DATETIME,
    CONSTRAINT "StageInvite_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StageInvite_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StageInvite_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_unique_handle_key" ON "User"("unique_handle");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
