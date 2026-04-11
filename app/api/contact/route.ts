import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";

const CONTACT_EMAIL = "leonge1@bu.edu";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? new Resend(key) : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body as {
      name: string;
      email: string;
      subject: string;
      message: string;
    };

    // Basic server-side validation
    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    // #region agent log
    const _hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const _hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const _hasSvcRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const _hasResend = !!process.env.RESEND_API_KEY;
    console.error('[debug-767379] env-check', JSON.stringify({ hasUrl: _hasUrl, hasAnon: _hasAnon, hasSvcRole: _hasSvcRole, hasResend: _hasResend }));
    // #endregion

    // 1. Save to Supabase using service role (bypasses anon RLS for insert)
    const supabase = await createServiceClient();
    const { error: dbError } = await supabase
      .from("contact_messages")
      .insert({ name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() });

    if (dbError) {
      console.error("Supabase insert error:", dbError);
      // #region agent log
      return NextResponse.json({ error: "Failed to save message.", _debug: { code: dbError.code, message: dbError.message, hint: dbError.hint } }, { status: 500 });
      // #endregion
    }

    // 2. Send notification email to ConnectNIL inbox
    const resend = getResend();
    if (!resend) {
      console.warn("RESEND_API_KEY not set; contact saved without notification email.");
      return NextResponse.json({ success: true });
    }

    const { error: emailError } = await resend.emails.send({
      from: "ConnectNIL Contact <onboarding@resend.dev>",
      to: CONTACT_EMAIL,
      replyTo: email.trim(),
      subject: `[ConnectNIL Contact] ${subject.trim()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #f9fafb; border-radius: 12px;">
          <h2 style="margin: 0 0 4px; font-size: 20px; color: #1f7ae0;">New Contact Message</h2>
          <p style="margin: 0 0 24px; font-size: 13px; color: #6b7280;">via ConnectNIL contact form</p>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; width: 80px;">From</td>
              <td style="padding: 8px 0; color: #111; font-size: 14px; font-weight: 600;">${name.trim()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Email</td>
              <td style="padding: 8px 0; color: #1f7ae0; font-size: 14px;">
                <a href="mailto:${email.trim()}" style="color: #1f7ae0;">${email.trim()}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Subject</td>
              <td style="padding: 8px 0; color: #111; font-size: 14px;">${subject.trim()}</td>
            </tr>
          </table>

          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
            <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap;">${message.trim()}</p>
          </div>

          <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            Hit reply to respond directly to ${name.trim()}.
          </p>
        </div>
      `,
    });

    if (emailError) {
      // Message is saved — just log the email failure, don't surface to user
      console.error("Resend email error:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Contact route error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
