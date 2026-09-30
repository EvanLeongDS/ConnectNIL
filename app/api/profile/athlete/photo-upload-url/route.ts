import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { isS3Configured, presignAthletePhotoUpload } from "@/lib/aws/s3";
import {
  PHOTO_MAX_FILE_BYTES,
  athletePhotoKey,
  extForPhotoMime,
  isAllowedPhotoType,
} from "@/lib/athletes/photo";

export const runtime = "nodejs";

/**
 * POST /api/profile/athlete/photo-upload-url
 *
 * body: { contentType: string, size: number }
 * 200:  { mode: "s3", key, url, contentType }
 *       { mode: "unavailable" }  <- S3 not configured; the caller should skip the photo
 *
 * Mints one short-lived presigned PUT so the browser uploads the image straight to S3 and
 * the bytes never transit this server. Serves BOTH the onboarding wizard and the profile
 * editor — they upload identically, and a second copy of this route would be a second
 * place for the key shape and the size cap to drift.
 *
 * Returning the key does not commit anything: the key is only written to the profile when
 * the athlete saves, and both save paths re-validate it. An abandoned upload leaves an
 * orphaned object, which the bucket's lifecycle rules eventually reap.
 *
 * ── On the role check ────────────────────────────────────────────────────────
 * user_metadata is writable by the user's own client (see the comment in
 * app/(auth)/role/page.tsx), so the role assertion below is a UX guard, NOT the security
 * boundary. The actual boundary is that the key is built from `user.id` taken from the
 * verified session: a caller who forged their role can still only ever be handed a
 * presigned PUT into their OWN athletes/<their id>/ prefix, and both save paths re-check
 * that prefix before storing the key.
 *
 * Gated on isS3Configured() rather than proofStorageDriver(): that flag is the
 * proof-pipeline rollout switch and is "supabase" in every default environment, which
 * would silently disable photo uploads everywhere.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.user_metadata?.role !== "athlete") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isS3Configured()) {
    // Not an error: localhost without AWS keys must still be able to complete onboarding.
    // The client drops the photo step rather than showing a failure.
    return NextResponse.json({ mode: "unavailable" });
  }

  let body: { contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : -1;

  const ext = extForPhotoMime(contentType);
  if (!isAllowedPhotoType(contentType) || !ext) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images are allowed." },
      { status: 400 }
    );
  }
  if (size <= 0 || size > PHOTO_MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Your photo must be at most ${Math.round(
          PHOTO_MAX_FILE_BYTES / 1024 / 1024
        )} MB.`,
      },
      { status: 400 }
    );
  }

  // A fresh uuid per upload, never a stable "avatar.jpg". Overwriting one key in place
  // would leave every already-issued presigned GET pointing at the new image, and the
  // 15-minute signing window means stale URLs stay live for a while after a change.
  const key = athletePhotoKey(user.id, randomUUID(), ext);

  try {
    const url = await presignAthletePhotoUpload(key, contentType, size);
    return NextResponse.json({ mode: "s3", key, url, contentType });
  } catch (err) {
    console.error("athlete photo presign failed:", err);
    return NextResponse.json(
      { error: "Could not prepare the upload. Please try again." },
      { status: 500 }
    );
  }
}
