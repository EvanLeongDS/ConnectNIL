import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseProofImageRefs, thumbKeyFor } from "@/lib/deals/deliverableProof";
import { deleteProofObjects } from "@/lib/aws/s3";

/**
 * PATCH /api/deals/[id]/deliverables
 *
 * body: { deliverable_id: string, action: "approve" | "reject" }
 *
 * - brand-manager: approve | reject  (deliverable must be "submitted")
 * Athlete/team submit with images + proof: POST .../deliverables/[deliverableId]/submit
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

    const updates =
      action === "approve"
        ? { status: "approved" as const }
        : {
            status: "rejected" as const,
            proof_description: null,
            proof_image_urls: [],
            submitted_at: null,
            // The analysis describes images that are about to stop existing. Leaving it
            // would show the next reviewer a moderation verdict for a deleted proof.
            proof_analysis: {},
            proof_review_flag: "pending" as const,
          };

    // Rejecting clears proof_image_urls, which would otherwise leave the uploaded S3
    // objects orphaned with nothing referencing them. Collect the keys before the update
    // so they can be cleaned up after it commits.
    let orphanKeys: string[] = [];
    if (action === "reject") {
      const { data: row } = await service
        .from("deliverables")
        .select("proof_image_urls")
        .eq("id", deliverable_id)
        .maybeSingle();
      const proofKeys = parseProofImageRefs(row?.proof_image_urls)
        .filter((r): r is { kind: "s3"; key: string } => r.kind === "s3")
        .map((r) => r.key);
      // Each proof object has a generated thumbnail under thumbs/. Nothing else
      // references it, so it orphans exactly as the original would.
      orphanKeys = [...proofKeys, ...proofKeys.map(thumbKeyFor)];
    }

    const { error: upErr } = await service.from("deliverables").update(updates).eq("id", deliverable_id);
    if (upErr) {
      console.error("deliverable review:", upErr);
      return NextResponse.json({ error: "Could not update deliverable." }, { status: 500 });
    }

    // Best-effort, after the row is committed. Legacy Supabase-hosted proofs are left in
    // place: removing those needs URL-to-path parsing and old demo objects cost nothing.
    await deleteProofObjects(orphanKeys);

    return NextResponse.json({ success: true, status: action === "approve" ? "approved" : "rejected" });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
