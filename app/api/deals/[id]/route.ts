import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDeliverableFrequency } from "@/lib/deals/deliverableFrequency";

const PAYMENT_TYPES = new Set(["one_time", "monthly", "per_deliverable"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "brand-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    description,
    season,
    dealType,
    totalValue,
    paymentType,
    paymentTerms,
    startDate,
    endDate,
    nilUseDescription,
    exclusivityClause,
    requiresOptIn,
    deliverables,
    brandSignerName,
  } = body as {
    title?: string;
    description?: string;
    season?: string;
    dealType?: string;
    totalValue?: number;
    paymentType?: string;
    paymentTerms?: string;
    startDate?: string;
    endDate?: string;
    nilUseDescription?: string;
    exclusivityClause?: string;
    requiresOptIn?: boolean;
    deliverables?: {
      title: string;
      description?: string;
      dueDate?: string;
      frequency?: string;
    }[];
    brandSignerName?: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!paymentType || !PAYMENT_TYPES.has(paymentType)) {
    return NextResponse.json({ error: "Valid payment type is required." }, { status: 400 });
  }
  const v = typeof totalValue === "number" ? totalValue : parseFloat(String(totalValue));
  if (!totalValue || isNaN(v) || v <= 0) {
    return NextResponse.json({ error: "Valid total value is required." }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
  }
  if (startDate >= endDate) {
    return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
  }
  const nilDesc = nilUseDescription?.trim() ?? "";
  if (nilDesc.length < 15) {
    return NextResponse.json(
      { error: "NIL use description must be at least a short sentence." },
      { status: 400 }
    );
  }
  if (!Array.isArray(deliverables) || deliverables.length === 0) {
    return NextResponse.json({ error: "Add at least one deliverable." }, { status: 400 });
  }
  const signer = typeof brandSignerName === "string" ? brandSignerName.trim() : "";
  if (signer.length < 2) {
    return NextResponse.json(
      { error: "Type your full name to sign the updated proposal." },
      { status: 400 }
    );
  }

  const { data: deal, error: dealErr } = await supabase
    .from("partnerships")
    .select("id, status, brand_id")
    .eq("id", id)
    .eq("brand_id", user.id)
    .maybeSingle();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }
  if (deal.status !== "pending") {
    return NextResponse.json(
      { error: "Only proposals awaiting team review can be edited." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("partnerships")
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      season: season?.trim() || null,
      deal_type: dealType || null,
      total_value: v,
      payment_type: paymentType,
      payment_terms: paymentTerms?.trim() || null,
      nil_use_description: nilDesc,
      exclusivity_clause: exclusivityClause?.trim() || null,
      requires_opt_in: requiresOptIn ?? false,
      start_date: startDate || null,
      end_date: endDate || null,
      brand_signer_name: signer,
      brand_signed_at: now,
    })
    .eq("id", id)
    .eq("brand_id", user.id)
    .eq("status", "pending");

  if (upErr) {
    console.error("PATCH deal:", upErr);
    return NextResponse.json({ error: "Could not update deal." }, { status: 500 });
  }

  const { error: delErr } = await supabase.from("deliverables").delete().eq("partnership_id", id);
  if (delErr) {
    console.error("delete deliverables:", delErr);
    return NextResponse.json({ error: "Could not update deliverables." }, { status: 500 });
  }

  const rows = deliverables
    .filter((d) => d.title?.trim())
    .map((d) => ({
      partnership_id: id,
      title: d.title.trim(),
      description: d.description?.trim() || null,
      due_date: d.dueDate || null,
      frequency: parseDeliverableFrequency(d.frequency),
      status: "pending" as const,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "At least one valid deliverable is required." }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("deliverables").insert(rows);
  if (insErr) {
    console.error("insert deliverables:", insErr);
    return NextResponse.json({ error: "Could not save deliverables." }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}
