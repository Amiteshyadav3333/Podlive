ALTER TABLE "LiveSession" ADD COLUMN "studio_config" JSONB;
ALTER TABLE "LiveSession" ADD COLUMN "brand_color" TEXT NOT NULL DEFAULT '#7C3AED';
ALTER TABLE "LiveSession" ADD COLUMN "audience_mode" TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE "LiveSession" ADD COLUMN "replay_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "Course" (
  "id" TEXT NOT NULL, "instructor_id" TEXT NOT NULL, "title" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "subtitle" TEXT, "description" TEXT, "thumbnail_url" TEXT, "trailer_url" TEXT, "category" TEXT,
  "level" TEXT NOT NULL DEFAULT 'all_levels', "language" TEXT NOT NULL DEFAULT 'Hindi',
  "price_amount" INTEGER NOT NULL DEFAULT 0, "compare_price_amount" INTEGER, "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'draft', "visibility" TEXT NOT NULL DEFAULT 'public', "outcomes" JSONB,
  "requirements" JSONB, "theme" JSONB, "certificate_enabled" BOOLEAN NOT NULL DEFAULT true,
  "discussion_enabled" BOOLEAN NOT NULL DEFAULT true, "enrollment_count" INTEGER NOT NULL DEFAULT 0,
  "rating_average" DOUBLE PRECISION NOT NULL DEFAULT 0, "rating_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");
CREATE INDEX "Course_instructor_id_status_idx" ON "Course"("instructor_id", "status");
CREATE INDEX "Course_status_visibility_category_idx" ON "Course"("status", "visibility", "category");
ALTER TABLE "Course" ADD CONSTRAINT "Course_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseSection" (
  "id" TEXT NOT NULL, "course_id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "CourseSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourseSection_course_id_position_idx" ON "CourseSection"("course_id", "position");
ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseLesson" (
  "id" TEXT NOT NULL, "section_id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'video', "video_url" TEXT, "live_session_id" TEXT, "resource_url" TEXT,
  "duration_seconds" INTEGER, "position" INTEGER NOT NULL DEFAULT 0, "is_preview" BOOLEAN NOT NULL DEFAULT false,
  "is_published" BOOLEAN NOT NULL DEFAULT false, "content" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "CourseLesson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourseLesson_section_id_position_idx" ON "CourseLesson"("section_id", "position");
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseEnrollment" (
  "id" TEXT NOT NULL, "course_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active',
  "progress_percent" DOUBLE PRECISION NOT NULL DEFAULT 0, "completed_lessons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3), "expires_at" TIMESTAMP(3),
  CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseEnrollment_course_id_user_id_key" ON "CourseEnrollment"("course_id", "user_id");
CREATE INDEX "CourseEnrollment_user_id_status_idx" ON "CourseEnrollment"("user_id", "status");
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseOrder" (
  "id" TEXT NOT NULL, "course_id" TEXT NOT NULL, "buyer_id" TEXT NOT NULL, "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "status" TEXT NOT NULL DEFAULT 'pending', "payment_provider" TEXT,
  "provider_order_id" TEXT, "provider_payment_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMP(3), CONSTRAINT "CourseOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourseOrder_buyer_id_status_idx" ON "CourseOrder"("buyer_id", "status");
CREATE INDEX "CourseOrder_course_id_status_idx" ON "CourseOrder"("course_id", "status");
ALTER TABLE "CourseOrder" ADD CONSTRAINT "CourseOrder_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseOrder" ADD CONSTRAINT "CourseOrder_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
