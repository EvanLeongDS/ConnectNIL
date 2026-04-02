import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = user.user_metadata?.role as string | undefined;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");

  const service = createServiceClient();

  if (kind === "brands" && (role === "athlete" || role === "team-manager")) {
    const { data: brands, error } = await service
      .from("brand_profiles")
      .select(
        "id, company_name, city, state, industry, budget_range, company_description, target_audience, preferred_sports, preferred_schools, campaign_types, website_url, social_instagram, social_x, social_linkedin"
      )
      .eq("onboarding_complete", true);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to load brands." }, { status: 500 });
    }

    return NextResponse.json({ brands: brands ?? [] });
  }

  if (kind === "teams" && role === "brand-manager") {
    const { data: teams, error } = await service
      .from("team_profiles")
      .select(
        "id, school, team_name, sport, division, num_players, availability, preferred_deals"
      )
      .eq("onboarding_complete", true);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to load teams." }, { status: 500 });
    }

    return NextResponse.json({ teams: teams ?? [] });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
