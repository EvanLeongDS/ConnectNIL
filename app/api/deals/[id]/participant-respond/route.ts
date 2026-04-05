import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  if (!row) return NextResponse.json({ error: "You are not on the roster for this deal." }, { status: 404 });
  if (row.status !== "invited") {
    return NextResponse.json({ error: "You have already responded to this deal." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updates =
    action === "accept"
      ? { status: "accepted" as const, responded_at: now }
      : { status: "declined" as const, responded_at: now };

  const { error: upErr } = await supabase
    .from("partnership_participants")
    .update(updates)
    .eq("id", row.id)
    .eq("athlete_id", user.id);

  if (upErr) {
    console.error("participant-respond:", upErr);
    return NextResponse.json({ error: "Could not update your response." }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: updates.status });
}
