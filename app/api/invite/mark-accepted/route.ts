import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Missing session" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const service = createServiceClient();
  const {
    data: { user },
    error: authErr,
  } = await service.auth.getUser(accessToken);
  if (authErr || !user?.email) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const emailNorm = user.email.toLowerCase();

  const { data: fullInv, error: fullInvErr } = await service
    .from("team_athlete_invitations")
    .select("id, email, team_id")
    .eq("token", token)
    .maybeSingle();

  if (fullInvErr || !fullInv) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  if (fullInv.email.toLowerCase() !== emailNorm) {
    return NextResponse.json({ error: "Email does not match invite" }, { status: 403 });
  }

  const { error: upErr } = await service
    .from("team_athlete_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token", token);

  if (upErr) {
    console.error(upErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Attach the inviting team's name to the athlete's profile
  const { data: teamProfile } = await service
    .from("team_profiles")
    .select("team_name")
    .eq("id", fullInv.team_id)
    .maybeSingle();

  if (teamProfile?.team_name) {
    await service
      .from("athlete_profiles")
      .update({ team: teamProfile.team_name, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  return NextResponse.json({ success: true, team_name: teamProfile?.team_name ?? null });
}
