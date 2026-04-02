import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

function isEduEmail(email: string) {
  return email.toLowerCase().endsWith(".edu");
}

function resendErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Email could not be sent.";
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

    // Read at request time so Next always sees current env (avoids stale module singleton).
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const resend = resendApiKey ? new Resend(resendApiKey) : null;
    const emailDeliveryConfigured = Boolean(resend);
    const fromAddress =
      process.env.RESEND_FROM?.trim() || "ConnectNIL <onboarding@resend.dev>";

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
      skipped?: boolean;
      manual?: boolean;
      inviteUrl?: string;
      error?: string;
    }[] = [];

    for (const email of emails) {
      const { data: existing, error: invSelectErr } = await service
        .from("team_athlete_invitations")
        .select("token, email_sent_at")
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

      if (existing?.email_sent_at) {
        results.push({ email, ok: true, skipped: true });
        continue;
      }

      const inviteUrl = `${base}/invite/athlete/${token}`;

      if (!emailDeliveryConfigured) {
        results.push({ email, ok: true, manual: true, inviteUrl });
        continue;
      }

      let emailError: unknown;
      try {
        const sendResult = await resend!.emails.send({
          from: fromAddress,
          to: email,
          ...(user.email ? { replyTo: user.email } : {}),
          subject: `You're invited to join ${profile.team_name} on ConnectNIL`,
          html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #f9fafb; border-radius: 12px;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #1f7ae0;">Join ConnectNIL</h2>
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
            ${profile.team_name} at ${profile.school} invited you to create your athlete account.
          </p>
          <a href="${inviteUrl}" style="display: inline-block; margin: 16px 0; padding: 12px 24px; background: #1f7ae0; color: #fff; text-decoration: none; border-radius: 9999px; font-weight: 600; font-size: 14px;">
            Accept invite & sign up
          </a>
          <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            If you did not expect this message, you can ignore it.
          </p>
        </div>
      `,
        });
        emailError = sendResult.error;
      } catch (resendThrow) {
        console.error("Resend send threw:", resendThrow);
        results.push({
          email,
          ok: false,
          error:
            resendThrow instanceof Error
              ? resendThrow.message
              : "Email send failed unexpectedly.",
        });
        continue;
      }

      if (emailError) {
        console.error(emailError);
        results.push({ email, ok: false, error: resendErrorMessage(emailError) });
        continue;
      }

      const { error: upErr } = await service
        .from("team_athlete_invitations")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("team_id", user.id)
        .eq("email", email);

      if (upErr) {
        console.error(upErr);
        results.push({ email, ok: false, error: "Sent but failed to update status" });
        continue;
      }

      results.push({ email, ok: true });
    }

    const sent = results.filter((r) => r.ok && !r.skipped && !r.manual).length;
    const skipped = results.filter((r) => r.skipped).length;
    const manualLinks = results
      .filter((r): r is typeof r & { inviteUrl: string } => Boolean(r.ok && r.manual && r.inviteUrl))
      .map((r) => ({ email: r.email, inviteUrl: r.inviteUrl }));

    return NextResponse.json({
      sent,
      skipped,
      emailDeliveryConfigured,
      manualLinks,
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
