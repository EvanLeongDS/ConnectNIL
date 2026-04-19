import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: inv, error: invErr } = await service
    .from("team_athlete_invitations")
    .select("email, accepted_at, team_id")
    .eq("token", token)
    .maybeSingle();

  if (invErr || !inv) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 404 });
  }

  const { data: team, error: teamErr } = await service
    .from("team_profiles")
    .select("team_name, school, sport, division")
    .eq("id", inv.team_id)
    .maybeSingle();

  if (teamErr || !team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({
    email: inv.email,
    accepted_at: inv.accepted_at,
    team_id: inv.team_id,
    team_name: team.team_name,
    school: team.school,
    sport: team.sport,
    division: team.division ?? null,
  });
}
