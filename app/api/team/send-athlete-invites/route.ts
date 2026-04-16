import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

function isEduEmail(email: string) {
  return email.toLowerCase().endsWith(".edu");
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.user_metadata?.role !== "team-manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { emails?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const raw = Array.isArray(body.emails) ? body.emails : [];
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const r of raw) {
      const n = normalizeEmail(String(r));
      if (!n || seen.has(n)) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) {
        return NextResponse.json({ error: `Invalid email: ${r}` }, { status: 400 });
      }
      if (!isEduEmail(n)) {
        return NextResponse.json({ error: `Athlete invites must use .edu emails: ${n}` }, { status: 400 });
      }
      seen.add(n);
      emails.push(n);
    }

    if (emails.length === 0) {
      return NextResponse.json({ error: "Add at least one valid .edu email." }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: profile, error: profileError } = await service
      .from("team_profiles")
      .select("athlete_emails, team_name, school")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Team profile not found." }, { status: 404 });
    }

    const rosterList = Array.from(new Set(emails.map(normalizeEmail)));

    const { error: updateProfileError } = await service
      .from("team_profiles")
      .update({ athlete_emails: rosterList, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateProfileError) {
      console.error(updateProfileError);
      return NextResponse.json({ error: "Failed to update roster." }, { status: 500 });
    }

    let site: string;
    try {
      site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    } catch {
      site = "http://localhost:3000";
    }
    const base = site.replace(/\/$/, "");

    const results: {
      email: string;
      ok: boolean;
      inviteUrl?: string;
      error?: string;
    }[] = [];

    for (const email of emails) {
      const { data: existing, error: invSelectErr } = await service
        .from("team_athlete_invitations")
        .select("token, accepted_at")
        .eq("team_id", user.id)
        .eq("email", email)
        .maybeSingle();

      if (invSelectErr) {
        console.error("team_athlete_invitations select:", invSelectErr);
        results.push({
          email,
          ok: false,
          error: invSelectErr.message || "Could not load invite.",
        });
        continue;
      }

      const token = existing?.token ?? randomBytes(24).toString("hex");

      if (!existing) {
        const { error: insErr } = await service.from("team_athlete_invitations").insert({
          team_id: user.id,
          email,
          token,
        });
        if (insErr) {
          console.error(insErr);
          results.push({ email, ok: false, error: "Failed to save invite." });
          continue;
        }
      }

      if (existing?.accepted_at) {
        results.push({ email, ok: true, inviteUrl: `${base}/invite/athlete/${token}` });
        continue;
      }

      const inviteUrl = `${base}/invite/athlete/${token}`;
      results.push({ email, ok: true, inviteUrl });
    }

    return NextResponse.json({
      manualLinks: results.filter((r): r is { email: string; ok: boolean; inviteUrl: string } => Boolean(r.ok && r.inviteUrl)).map((r) => ({ email: r.email, inviteUrl: r.inviteUrl })),
      results,
    });
  } catch (err) {
    console.error("send-athlete-invites:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error." },
      { status: 500 },
    );
  }
}
