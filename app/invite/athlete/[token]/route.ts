import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const INVITE_COOKIE = "cn_athlete_invite_token";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.redirect(new URL("/signup/athlete", request.url));
  }

  const service = createServiceClient();
  const { data: inv, error } = await service
    .from("team_athlete_invitations")
    .select("email, opened_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !inv) {
    return NextResponse.redirect(new URL("/signup/athlete", request.url));
  }

  if (!inv.opened_at) {
    await service
      .from("team_athlete_invitations")
      .update({ opened_at: new Date().toISOString() })
      .eq("token", token);
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const dest = new URL("/signup/athlete", site);
  dest.searchParams.set("email", inv.email);
  dest.searchParams.set("invite", token);

  const res = NextResponse.redirect(dest);
  res.cookies.set(INVITE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
