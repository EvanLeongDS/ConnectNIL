import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { DeliverableFrequency } from "@/lib/deals/types";

const FREQUENCIES: DeliverableFrequency[] = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "season",
];

function parseFrequency(v: unknown): DeliverableFrequency {
  if (typeof v === "string" && FREQUENCIES.includes(v as DeliverableFrequency)) {
    return v as DeliverableFrequency;
  }
  return "one_time";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    teamId,
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
  } = body as {
    teamId?: string;
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
  };

  if (!teamId?.trim()) return NextResponse.json({ error: "Team is required." }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!paymentType) return NextResponse.json({ error: "Payment type is required." }, { status: 400 });

  const service = createServiceClient();

  const [{ data: brand }, { data: team }] = await Promise.all([
    service.from("brand_profiles").select("company_name").eq("id", user.id).maybeSingle(),
    service.from("team_profiles").select("school, team_name").eq("id", teamId).maybeSingle(),
  ]);
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const { data: partnership, error: pErr } = await service
    .from("partnerships")
    .insert({
      brand_id: user.id,
      team_id: teamId,
      athlete_id: null,
      title: title.trim(),
      description: description?.trim() || null,
      season: season?.trim() || null,
      deal_type: dealType || null,
      total_value: totalValue || null,
      payment_type: paymentType,
      payment_terms: paymentTerms?.trim() || null,
      nil_use_description: nilUseDescription?.trim() || null,
      exclusivity_clause: exclusivityClause?.trim() || null,
      requires_opt_in: requiresOptIn ?? false,
      start_date: startDate || null,
      end_date: endDate || null,
      status: "pending",
      proposed_by: user.id,
      brand_signed_at: new Date().toISOString(),
      brand_display_name: brand?.company_name ?? null,
      team_display_name: `${team.school} ${team.team_name}`,
      notes: null,
    })
    .select("id")
    .single();

  if (pErr || !partnership) {
    console.error("propose deal:", pErr);
    return NextResponse.json({ error: "Could not create deal." }, { status: 500 });
  }

  if (deliverables?.length) {
    const rows = deliverables
      .filter((d) => d.title?.trim())
      .map((d) => ({
        partnership_id: partnership.id,
        title: d.title.trim(),
        description: d.description?.trim() || null,
        due_date: d.dueDate || null,
        frequency: parseFrequency(d.frequency),
        status: "pending",
      }));
    if (rows.length > 0) {
      const { error: dErr } = await service.from("deliverables").insert(rows);
      if (dErr) console.error("insert deliverables:", dErr);
    }
  }

  return NextResponse.json({ id: partnership.id });
}
