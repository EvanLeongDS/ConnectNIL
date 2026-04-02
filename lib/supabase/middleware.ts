import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in → don't show auth pages, send to dashboard router
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
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
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
