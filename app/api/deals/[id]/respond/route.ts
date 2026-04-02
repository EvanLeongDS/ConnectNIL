import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "team-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Action must be accept or decline." }, { status: 400 });
  }

  const { data: deal } = await supabase
    .from("partnerships")
    .select("id, status, team_id")
    .eq("id", id)
    .eq("team_id", user.id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  if (deal.status !== "pending") {
    return NextResponse.json({ error: "This deal cannot be updated." }, { status: 409 });
  }

  const updates =
    action === "accept"
      ? { status: "active", team_signed_at: new Date().toISOString() }
      : { status: "cancelled" };

  const { error: upErr } = await supabase
    .from("partnerships")
    .update(updates)
    .eq("id", id)
    .eq("team_id", user.id);

  if (upErr) {
    console.error("respond deal:", upErr);
    return NextResponse.json({ error: "Could not update deal." }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: updates.status });
}
