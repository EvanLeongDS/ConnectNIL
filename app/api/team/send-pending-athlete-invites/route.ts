import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function resendErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Email could not be sent.";
}

export async function POST() {
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

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (!resendApiKey) {
      return NextResponse.json({ error: "Email delivery is not configured." }, { status: 400 });
    }
    const resend = new Resend(resendApiKey);
    const fromAddress = process.env.RESEND_FROM?.trim() || "ConnectNIL <onboarding@resend.dev>";

    const service = createServiceClient();

    const { data: profile, error: profileError } = await service
      .from("team_profiles")
      .select("team_name, school")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      return NextResponse.json({ error: "Team profile not found." }, { status: 404 });
    }

    const { data: pendingInvites, error: pendingError } = await service
      .from("team_athlete_invitations")
      .select("email, token, email_sent_at, accepted_at")
      .eq("team_id", user.id)
      .is("email_sent_at", null);

    if (pendingError) {
      console.error("pending invites select:", pendingError);
      return NextResponse.json({ error: "Could not load pending invites." }, { status: 500 });
    }

    const toSend = (pendingInvites ?? []).filter((i) => i.token && !i.accepted_at);
    if (toSend.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, results: [] });
    }

    let site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
    if (!site) site = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
    if (!site) site = "http://localhost:3000";
    const base = site.replace(/\/$/, "");

    const results: { email: string; ok: boolean; error?: string }[] = [];
    let sent = 0;
    let skipped = 0;

    for (const inv of toSend) {
      const inviteUrl = `${base}/invite/athlete/${inv.token}`;
      try {
        const sendResult = await resend.emails.send({
          from: fromAddress,
          to: inv.email,
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

        if (sendResult.error) {
          console.error(sendResult.error);
          results.push({ email: inv.email, ok: false, error: resendErrorMessage(sendResult.error) });
          continue;
        }
      } catch (e) {
        console.error("Resend send threw:", e);
        results.push({
          email: inv.email,
          ok: false,
          error: e instanceof Error ? e.message : "Email send failed unexpectedly.",
        });
        continue;
      }

      const { error: upErr } = await service
        .from("team_athlete_invitations")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("team_id", user.id)
        .eq("email", inv.email);

      if (upErr) {
        console.error(upErr);
        results.push({ email: inv.email, ok: false, error: "Sent but failed to update status" });
        continue;
      }

      sent += 1;
      results.push({ email: inv.email, ok: true });
    }

    // "Skipped" here means "not eligible to send" (accepted) but we already filtered those out.
    // Keep the field for UI consistency / future use.
    skipped += (pendingInvites ?? []).length - toSend.length;

    return NextResponse.json({ sent, skipped, results });
  } catch (err) {
    console.error("send-pending-athlete-invites:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error." },
      { status: 500 }
    );
  }
}

