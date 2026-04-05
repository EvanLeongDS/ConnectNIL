import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseDeliverableFrequency } from "@/lib/deals/deliverableFrequency";

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
    brandSignerName,
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
    brandSignerName?: string;
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
  const signer = typeof brandSignerName === "string" ? brandSignerName.trim() : "";
  if (signer.length < 2) {
    return NextResponse.json(
      { error: "Type your full name to sign as the brand representative." },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const [{ data: brand }, { data: team }] = await Promise.all([
    service.from("brand_profiles").select("company_name").eq("id", user.id).maybeSingle(),
    service.from("team_profiles").select("school, team_name, athlete_emails").eq("id", teamId).maybeSingle(),
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
      brand_signer_name: signer,
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
        frequency: parseDeliverableFrequency(d.frequency),
        status: "pending",
      }));
    if (rows.length > 0) {
      const { error: dErr } = await service.from("deliverables").insert(rows);
      if (dErr) console.error("insert deliverables:", dErr);
    }
  }

  const normEmail = (e: string) => e.trim().toLowerCase();
  const rosterEmails = Array.from(
    new Set(
      (team.athlete_emails ?? []).map((e: unknown) => normEmail(String(e))).filter(Boolean)
    )
  );
  if (rosterEmails.length > 0) {
    const { data: profs } = await service.from("profiles").select("id, email").in("email", rosterEmails);
    const ids = (profs ?? []).map((p) => p.id);
    if (ids.length > 0) {
      const { data: athleteRows } = await service.from("athlete_profiles").select("id").in("id", ids);
      const athleteIds = (athleteRows ?? []).map((a) => a.id);
      if (athleteIds.length > 0) {
        const participantRows = athleteIds.map((athlete_id) => ({
          partnership_id: partnership.id,
          athlete_id,
          status: "invited" as const,
        }));
        const { error: partErr } = await service.from("partnership_participants").insert(participantRows);
        if (partErr) console.error("insert partnership_participants:", partErr);
      }
    }
  }

  return NextResponse.json({ id: partnership.id });
}
