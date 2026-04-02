import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = await request.json();
    const service = await createServiceClient();

    await service.from("profiles").upsert(
      { id: user.id, email: user.email },
      { onConflict: "id" }
    );

    const { error } = await service.from("team_profiles").upsert({
      id: user.id,
      school: body.school,
      team_name: body.team_name,
      sport: body.sport,
      division: body.division || null,
      num_players: body.num_players,
      manager_first_name: body.manager_first_name,
      manager_last_name: body.manager_last_name,
      phone: body.phone,
      athlete_emails: body.athlete_emails ?? [],
      interested_brands: body.interested_brands ?? [],
      preferred_deals: body.preferred_deals ?? [],
      availability: body.availability,
      onboarding_complete: true,
    });

    if (error) {
      console.error("Team onboarding DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Team onboarding unexpected error:", err);
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
