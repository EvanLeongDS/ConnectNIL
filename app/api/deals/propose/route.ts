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

  // Checked BEFORE the partnership insert, so an empty proposal fails without leaving a row
  // behind. ProposeDealForm enforces this client-side too; this closes the API gap.
  if (!deliverables?.some((d) => d.title?.trim())) {
    return NextResponse.json({ error: "Add at least one deliverable." }, { status: 400 });
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

  // A deal with no deliverables is not a deal — and the PATCH sibling
  // (app/api/deals/[id]/route.ts) already refuses one, so accepting it here produced deals
  // that could be proposed but never edited.
  const deliverableRows = (deliverables ?? [])
    .filter((d) => d.title?.trim())
    .map((d) => ({
      partnership_id: partnership.id,
      title: d.title.trim(),
      description: d.description?.trim() || null,
      due_date: d.dueDate || null,
      frequency: parseDeliverableFrequency(d.frequency),
      // Migration 017's DEFAULT is already 'not_started'; this literal was overriding it
      // and is why the legacy value kept appearing in rows created long after that ran.
      status: "not_started",
    }));

  const { error: dErr } = await service.from("deliverables").insert(deliverableRows);
  if (dErr) {
    // This used to be logged and swallowed, so the brand saw "Deal proposal sent!" while the
    // team manager opened a contract reading "No specific deliverables listed" — with no one
    // notified. The insert is a single statement, so the only failure mode is "none landed";
    // roll the partnership back rather than leaving a deal that means nothing.
    // Safe to delete: participants are inserted below, after this point.
    await service.from("partnerships").delete().eq("id", partnership.id);
    console.error("propose deal: deliverables insert failed, rolled back partnership", partnership.id, dErr);
    return NextResponse.json(
      { error: "Could not save the deliverables, so the deal was not created. Please try again." },
      { status: 500 }
    );
  }

  // Unlike the deliverables above, a participant failure must NOT roll the deal back:
  // athletes on a team roster still reach the deal through team_athlete_invitations, so the
  // deal is usable without these rows. It does need to be visible rather than silent.
  let participantInviteFailed = false;

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
        if (partErr) {
          participantInviteFailed = true;
          console.error(
            "insert partnership_participants failed for partnership %s (athletes: %s):",
            partnership.id,
            athleteIds.join(", "),
            partErr
          );
        }
      }
    }
  }

  return NextResponse.json({ id: partnership.id, participantInviteFailed });
}
