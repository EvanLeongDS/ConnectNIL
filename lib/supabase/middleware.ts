import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** @supabase/ssr cookie batch shape (typed for strict TS). */
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

function misconfigResponse(message: string) {
  return new NextResponse(message, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return misconfigResponse(
      "Server misconfiguration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the deployment (e.g. Vercel → Environment Variables → Production)."
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    const isAuthRoute =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/role");
    const isProtectedRoute =
      pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");

    // Not logged in → push to login
    if (!user && isProtectedRoute) {
      const nextUrl = request.nextUrl.clone();
      nextUrl.pathname = "/login";
      return NextResponse.redirect(nextUrl);
    }

    // Logged in → don't show auth pages, send to dashboard router
    if (user && isAuthRoute) {
      const nextUrl = request.nextUrl.clone();
      nextUrl.pathname = "/dashboard";
      return NextResponse.redirect(nextUrl);
    }

    // Logged in — enforce that each dashboard sub-route matches the user's role
    if (user && pathname.startsWith("/dashboard/")) {
      const role = user.user_metadata?.role as string | undefined;

      const roleMap: Record<string, string> = {
        athlete: "/dashboard/athlete-dashboard",
        "brand-manager": "/dashboard/brand-dashboard",
        "team-manager": "/dashboard/team-dashboard",
      };

      const allowedPath = role ? roleMap[role] : undefined;

      // If they hit a role-specific sub-path that isn't theirs, send to router
      const rolePaths = Object.values(roleMap);
      const isRoleSubPath = rolePaths.some((p) => pathname.startsWith(p));

      if (isRoleSubPath && allowedPath && !pathname.startsWith(allowedPath)) {
        const nextUrl = request.nextUrl.clone();
        nextUrl.pathname = "/dashboard";
        return NextResponse.redirect(nextUrl);
      }
    }

    return supabaseResponse;
  } catch (err) {
    console.error("[middleware] updateSession failed:", err);
    return misconfigResponse(
      "Authentication middleware failed. Check Supabase env vars and project status, then see deployment logs."
    );
  }
}
