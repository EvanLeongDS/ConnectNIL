import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const INVITE_COOKIE = "cn_athlete_invite_token";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const inviteToken = request.cookies.get(INVITE_COOKIE)?.value;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (inviteToken && user?.email) {
        const service = createServiceClient();
        const { data: inv } = await service
          .from("team_athlete_invitations")
          .select("email")
          .eq("token", inviteToken)
          .maybeSingle();

        if (inv && inv.email.toLowerCase() === user.email.toLowerCase()) {
          await service
            .from("team_athlete_invitations")
            .update({ accepted_at: new Date().toISOString() })
            .eq("token", inviteToken);
        }
      }

      const res = NextResponse.redirect(`${origin}/dashboard`);
      if (inviteToken) {
        res.cookies.set(INVITE_COOKIE, "", { path: "/", maxAge: 0 });
      }
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
