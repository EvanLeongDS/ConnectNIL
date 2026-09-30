import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GRAD_YEARS, SCHOOL_BANNED } from "@/lib/profile/athleteConstants";
import {
  discardSupersededPhoto,
  verifyAthletePhotoKey,
} from "@/lib/athletes/photoCommit";

function isValidPhone(val: string) {
  return /^[\d\s\-().+]{7,15}$/.test(val.trim());
}

function formatHandle(val: string) {
  const t = val.trim();
  if (!t) return null;
  return t.startsWith("@") ? t.slice(1) : t;
}

function parseFollowers(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function validateSchool(val: string): string | null {
  const lower = val.toLowerCase().trim();
  if (val.trim().length < 3) return "School name is too short.";
  for (const term of SCHOOL_BANNED) {
    if (lower.includes(term)) return "Please enter a 4-year college or university.";
  }
  if (/^\d+$/.test(val.trim())) return "Please enter a valid school name.";
  return null;
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "athlete") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const school = typeof body.school === "string" ? body.school.trim() : "";
  const sport = typeof body.sport === "string" ? body.sport.trim() : "";
  const team = typeof body.team === "string" ? body.team.trim() : "";
  const graduationYear =
    typeof body.graduationYear === "number"
      ? body.graduationYear
      : parseInt(String(body.graduationYear ?? ""), 10);

  if (!firstName) return NextResponse.json({ error: "First name is required." }, { status: 400 });
  if (!lastName) return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
  const schoolErr = validateSchool(school);
  if (schoolErr) return NextResponse.json({ error: schoolErr }, { status: 400 });
  const minGrad = Math.min(...GRAD_YEARS) - 6;
  const maxGrad = Math.max(...GRAD_YEARS) + 2;
  if (!Number.isFinite(graduationYear) || graduationYear < minGrad || graduationYear > maxGrad) {
    return NextResponse.json({ error: "Select a valid graduation year." }, { status: 400 });
  }
  if (!sport || sport.length < 2 || sport.length > 80) {
    return NextResponse.json({ error: "Enter a valid sport." }, { status: 400 });
  }
  if (!team) return NextResponse.json({ error: "Team is required." }, { status: 400 });

  const bio = typeof body.bio === "string" ? body.bio.trim() || null : null;

  /* Photo. Three distinct cases, which is why this tests for the KEY'S PRESENCE rather
     than its truthiness:

       photoKey absent      -> leave the existing photo alone
       photoKey === null    -> the athlete removed their photo
       photoKey === "<key>" -> a newly uploaded object to verify and adopt

     Collapsing absent and null would make every save that happened not to include the
     field silently delete the athlete's photo. */
  const wantsPhotoChange = Object.prototype.hasOwnProperty.call(body, "photoKey");
  let nextPhotoKey: string | null = null;
  if (wantsPhotoChange && typeof body.photoKey === "string" && body.photoKey) {
    const verified = await verifyAthletePhotoKey(body.photoKey, user.id);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }
    nextPhotoKey = verified.key;
  }

  /* Read the outgoing key BEFORE the update so the old object can be cleaned up after.
     Self-read is permitted by athlete_profiles' own RLS policy, so the cookie client is
     enough — no service client needed here. */
  let previousPhotoKey: string | null = null;
  if (wantsPhotoChange) {
    const { data: existing } = await supabase
      .from("athlete_profiles")
      .select("photo_key")
      .eq("id", user.id)
      .maybeSingle();
    previousPhotoKey = (existing as { photo_key: string | null } | null)?.photo_key ?? null;
  }

  const { error } = await supabase
    .from("athlete_profiles")
    .update({
      ...(wantsPhotoChange ? { photo_key: nextPhotoKey } : {}),
      first_name: firstName,
      last_name: lastName,
      phone,
      school,
      graduation_year: graduationYear,
      sport,
      team,
      bio,
      instagram_handle: formatHandle(String(body.instagramHandle ?? "")),
      tiktok_handle: formatHandle(String(body.tiktokHandle ?? "")),
      twitter_handle: formatHandle(String(body.twitterHandle ?? "")),
      snapchat_handle: formatHandle(String(body.snapchatHandle ?? "")),
      instagram_followers: parseFollowers(body.instagramFollowers),
      tiktok_followers: parseFollowers(body.tiktokFollowers),
      twitter_followers: parseFollowers(body.twitterFollowers),
      snapchat_followers: parseFollowers(body.snapchatFollowers),
    })
    .eq("id", user.id);

  if (error) {
    console.error("athlete profile update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* Only after the new key is durably written. Best-effort and non-throwing: the athlete's
     save has already succeeded, and a failed cleanup must not turn that into an error. */
  if (wantsPhotoChange) {
    await discardSupersededPhoto(previousPhotoKey, nextPhotoKey);
  }

  return NextResponse.json({ success: true, photoKey: nextPhotoKey });
}
