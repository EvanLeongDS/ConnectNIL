import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = await request.json();
    const {
      firstName, lastName, phone, school, graduation_year,
      sport, team, bio, instagram_handle, tiktok_handle,
      twitter_handle, snapchat_handle,
      instagram_followers, tiktok_followers,
      twitter_followers, snapchat_followers,
    } = body;

    const parseFollowers = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const service = createServiceClient();

    const { error: profilesError } = await service.from("profiles").upsert(
      { id: user.id, email: user.email },
      { onConflict: "id" }
    );

    if (profilesError) {
      return NextResponse.json({ error: "Failed to create profile: " + profilesError.message }, { status: 500 });
    }

    const { error } = await service.from("athlete_profiles").upsert({
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      phone,
      school,
      graduation_year,
      sport,
      team,
      bio: bio || null,
      instagram_handle: instagram_handle || null,
      tiktok_handle: tiktok_handle || null,
      twitter_handle: twitter_handle || null,
      snapchat_handle: snapchat_handle || null,
      instagram_followers: parseFollowers(instagram_followers),
      tiktok_followers: parseFollowers(tiktok_followers),
      twitter_followers: parseFollowers(twitter_followers),
      snapchat_followers: parseFollowers(snapchat_followers),
      onboarding_complete: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Athlete onboarding error:", msg);
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
