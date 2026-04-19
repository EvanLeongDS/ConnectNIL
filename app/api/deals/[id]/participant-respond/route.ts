import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: partnershipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "athlete") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Action must be accept or decline." }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("partnership_participants")
    .select("id, status")
    .eq("partnership_id", partnershipId)
    .eq("athlete_id", user.id)
    .maybeSingle();

  const now = new Date().toISOString();
  const newStatus = action === "accept" ? ("accepted" as const) : ("declined" as const);

  // Athlete already has a participation row — just update it
  if (row) {
    if (row.status !== "invited") {
      return NextResponse.json({ error: "You have already responded to this deal." }, { status: 409 });
    }
    const { error: upErr } = await supabase
      .from("partnership_participants")
      .update({ status: newStatus, responded_at: now })
      .eq("id", row.id)
      .eq("athlete_id", user.id);

    if (upErr) {
      console.error("participant-respond update:", upErr);
      return NextResponse.json({ error: "Could not update your response." }, { status: 500 });
    }
    return NextResponse.json({ success: true, status: newStatus });
  }

  // No row yet — athlete is on the team but was not in partnership_participants
  // (joined after the deal was proposed). Verify team membership then insert.
  const service = createServiceClient();

  const { data: deal } = await service
    .from("partnerships")
    .select("team_id")
    .eq("id", partnershipId)
    .maybeSingle();

  if (!deal?.team_id) {
    return NextResponse.json({ error: "You are not on the roster for this deal." }, { status: 404 });
  }

  const { data: userProfile } = await service
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();

  const userEmail = userProfile?.email?.toLowerCase();
  if (!userEmail) {
    return NextResponse.json({ error: "Could not verify your identity." }, { status: 500 });
  }

  const { data: invite } = await service
    .from("team_athlete_invitations")
    .select("id")
    .eq("team_id", deal.team_id)
    .eq("email", userEmail)
    .not("accepted_at", "is", null)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "You are not on the roster for this deal." }, { status: 404 });
  }

  const { error: insErr } = await service
    .from("partnership_participants")
    .insert({
      partnership_id: partnershipId,
      athlete_id: user.id,
      status: newStatus,
      responded_at: now,
    });

  if (insErr) {
    console.error("participant-respond insert:", insErr);
    return NextResponse.json({ error: "Could not save your response." }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: newStatus });
}
