import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH /api/deals/[id]/deliverables
 *
 * body: { deliverable_id: string, action: "submit" | "approve" | "reject" }
 *
 * - brand-manager: approve | reject  (deliverable must be "submitted")
 * - team-manager / athlete: submit   (deliverable must be "pending" or "rejected")
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: partnershipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { deliverable_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { deliverable_id, action } = body;
  if (!deliverable_id) {
    return NextResponse.json({ error: "deliverable_id is required." }, { status: 400 });
  }

  const role = user.user_metadata?.role as string | undefined;
  const service = createServiceClient();

  // ── Brand: approve / reject ──────────────────────────────────────────────────
  if (role === "brand-manager") {
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject." }, { status: 400 });
    }

    const { data: deal } = await supabase
      .from("partnerships")
      .select("id, status")
      .eq("id", partnershipId)
      .eq("brand_id", user.id)
      .maybeSingle();
    if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    if (deal.status !== "active") {
      return NextResponse.json(
        { error: "Can only review deliverables on active deals." },
        { status: 409 }
      );
    }

    const { data: deliverable } = await service
      .from("deliverables")
      .select("id, status")
      .eq("id", deliverable_id)
      .eq("partnership_id", partnershipId)
      .maybeSingle();
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
    if (deliverable.status !== "submitted") {
      return NextResponse.json(
        { error: "Only submitted deliverables can be approved or rejected." },
        { status: 409 }
      );
    }

    const { error: upErr } = await service
      .from("deliverables")
      .update({ status: action === "approve" ? "approved" : "rejected" })
      .eq("id", deliverable_id);
    if (upErr) {
      console.error("deliverable review:", upErr);
      return NextResponse.json({ error: "Could not update deliverable." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: action === "approve" ? "approved" : "rejected" });
  }

  // ── Athlete / Team: submit ───────────────────────────────────────────────────
  if (role === "team-manager" || role === "athlete") {
    if (action !== "submit") {
      return NextResponse.json({ error: "action must be submit." }, { status: 400 });
    }

    // Verify the user has access to this active deal
    let hasAccess = false;

    if (role === "team-manager") {
      const { data } = await supabase
        .from("partnerships")
        .select("id, status")
        .eq("id", partnershipId)
        .eq("team_id", user.id)
        .maybeSingle();
      hasAccess = !!data && data.status === "active";
    } else {
      // Direct athlete deal
      const { data: directDeal } = await supabase
        .from("partnerships")
        .select("id, status")
        .eq("id", partnershipId)
        .eq("athlete_id", user.id)
        .maybeSingle();
      if (directDeal?.status === "active") {
        hasAccess = true;
      } else {
        // Roster participation (accepted)
        const { data: pp } = await supabase
          .from("partnership_participants")
          .select("id")
          .eq("partnership_id", partnershipId)
          .eq("athlete_id", user.id)
          .eq("status", "accepted")
          .maybeSingle();
        if (pp) {
          const { data: dealData } = await supabase
            .from("partnerships")
            .select("status")
            .eq("id", partnershipId)
            .maybeSingle();
          hasAccess = dealData?.status === "active";
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this deal or it is not active." },
        { status: 403 }
      );
    }

    const { data: deliverable } = await service
      .from("deliverables")
      .select("id, status")
      .eq("id", deliverable_id)
      .eq("partnership_id", partnershipId)
      .maybeSingle();
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
    if (deliverable.status !== "pending" && deliverable.status !== "rejected") {
      return NextResponse.json(
        { error: "This deliverable cannot be submitted in its current state." },
        { status: 409 }
      );
    }

    const { error: upErr } = await service
      .from("deliverables")
      .update({ status: "submitted" })
      .eq("id", deliverable_id);
    if (upErr) {
      console.error("deliverable submit:", upErr);
      return NextResponse.json({ error: "Could not submit deliverable." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "submitted" });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
