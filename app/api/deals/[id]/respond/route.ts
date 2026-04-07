import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

  let body: { action?: string; teamSignerName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, teamSignerName } = body;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Action must be accept or decline." }, { status: 400 });
  }

  if (action === "accept") {
    const name = typeof teamSignerName === "string" ? teamSignerName.trim() : "";
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Type your full name to sign as the team representative." },
        { status: 400 }
      );
    }
  }

  const { data: deal } = await supabase
    .from("partnerships")
    .select("id, status, team_id, brand_id")
    .eq("id", id)
    .eq("team_id", user.id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  if (deal.status !== "pending") {
    return NextResponse.json({ error: "This deal cannot be updated." }, { status: 409 });
  }

  const teamName =
    action === "accept" && typeof teamSignerName === "string" ? teamSignerName.trim() : "";
  const updates =
    action === "accept"
      ? {
          status: "active" as const,
          team_signed_at: new Date().toISOString(),
          team_signer_name: teamName,
        }
      : { status: "cancelled" as const };

  const { error: upErr } = await supabase
    .from("partnerships")
    .update(updates)
    .eq("id", id)
    .eq("team_id", user.id);

  if (upErr) {
    console.error("respond deal:", upErr);
    return NextResponse.json({ error: "Could not update deal." }, { status: 500 });
  }

  if (action === "accept" && deal.brand_id) {
    const teamId = deal.team_id as string;
    const brandId = deal.brand_id as string;
    const service = createServiceClient();
    const [a, b] = await Promise.all([
      service
        .from("discovery_interests")
        .delete()
        .eq("viewer_id", brandId)
        .eq("subject_type", "team")
        .eq("subject_id", teamId),
      service
        .from("discovery_interests")
        .delete()
        .eq("viewer_id", teamId)
        .eq("subject_type", "brand")
        .eq("subject_id", brandId),
    ]);
    if (a.error) console.error("respond deal clear interest (brand→team):", a.error);
    if (b.error) console.error("respond deal clear interest (team→brand):", b.error);
  }

  return NextResponse.json({ success: true, status: updates.status });
}
