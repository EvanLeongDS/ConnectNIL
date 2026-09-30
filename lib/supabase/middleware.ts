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

/** Vercel/UI copy-paste often wraps values in quotes — strip so URL/key parse correctly. */
function trimEnv(value: string | undefined) {
  const t = value?.trim();
  if (!t) return "";
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export async function updateSession(request: NextRequest) {
  const url = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    return misconfigResponse(
      "Server misconfiguration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the deployment (e.g. Vercel → Environment Variables → Production)."
    );
  }

  try {
    new URL(url);
  } catch {
    return misconfigResponse(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Copy Project URL from Supabase (e.g. https://xxxx.supabase.co) with no extra quotes or spaces."
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
          for (const { name, value } of cookiesToSet) {
            try {
              request.cookies.set(name, value);
            } catch {
              // Some Next.js runtimes disallow mutating request cookies; response Set-Cookie is enough for the browser.
            }
          }
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data, error: userError } = await supabase.auth.getUser();
    const user = data.user;

    if (userError) {
      // Stale/invalid session cookies return an error but should not take the site offline.
      console.error("[middleware] supabase.auth.getUser:", userError.message);
    }

    const { pathname } = request.nextUrl;

    const isAuthRoute =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/role");
    const isProtectedRoute =
      pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");

    /* An account whose user_metadata.role is missing, empty or unrecognised. This is a real
     * state, not a theoretical one: /signup used to read the role from a query param and
     * store "" when it was absent, and users created straight from the Supabase dashboard
     * have no role at all.
     *
     * Such a user used to be unrecoverable. /dashboard sent them to /login, the block below
     * sent them from /login back to /dashboard, and the browser gave up with
     * ERR_TOO_MANY_REDIRECTS — and because /role is itself an auth route, the one page that
     * could have fixed the account bounced too. Signing out was the only escape. */
    const VALID_ROLES = new Set(["athlete", "brand-manager", "team-manager"]);
    const role = user?.user_metadata?.role as string | undefined;
    const needsRole = Boolean(user) && !VALID_ROLES.has(role ?? "");

    // Not logged in → push to login
    if (!user && isProtectedRoute) {
      const nextUrl = request.nextUrl.clone();
      nextUrl.pathname = "/login";
      return NextResponse.redirect(nextUrl);
    }

    // Role-less → the role picker is the only useful destination, and it must stay reachable.
    if (needsRole && isProtectedRoute) {
      const nextUrl = request.nextUrl.clone();
      nextUrl.pathname = "/role";
      nextUrl.search = "";
      return NextResponse.redirect(nextUrl);
    }

    // Logged in → don't show auth pages, send to dashboard router
    if (user && isAuthRoute) {
      // Team invite links redirect to /signup/athlete?invite=… — athletes who are already signed in
      // must be allowed through so the page can call /api/invite/mark-accepted (middleware was
      // stripping the query and they never showed as "Joined" on the roster).
      const hasTeamInvite =
        pathname.startsWith("/signup/athlete") &&
        Boolean(request.nextUrl.searchParams.get("invite")?.trim());
      // A role-less user on /role is the one case where an authenticated visitor genuinely
      // belongs on an auth route — it is where they go to become recoverable. Bouncing them
      // to /dashboard is the second half of the redirect loop described above.
      const fixingRole = needsRole && pathname.startsWith("/role");
      if (!hasTeamInvite && !fixingRole) {
        const nextUrl = request.nextUrl.clone();
        nextUrl.pathname = "/dashboard";
        return NextResponse.redirect(nextUrl);
      }
    }

    // Logged in — enforce that each dashboard sub-route matches the user's role
    if (user && pathname.startsWith("/dashboard/")) {
      const roleMap: Record<string, string> = {
        athlete: "/dashboard/athlete-dashboard",
        "brand-manager": "/dashboard/brand-dashboard",
        "team-manager": "/dashboard/team-dashboard",
      };

      const allowedPath = role ? roleMap[role] : undefined;

      // If they hit a role-specific sub-path that isn't theirs, send to router
      const rolePaths = Object.values(roleMap);
      const isRoleSubPath = rolePaths.some((p) => pathname.startsWith(p));

      // An unknown role left allowedPath undefined, which made the guard below fall through
      // and skip role enforcement ENTIRELY — so the users with no valid role were the only
      // ones who could open any role's dashboard. Handle them first.
      if (isRoleSubPath && !allowedPath) {
        const nextUrl = request.nextUrl.clone();
        nextUrl.pathname = "/role";
        nextUrl.search = "";
        return NextResponse.redirect(nextUrl);
      }

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
      "Authentication middleware failed. Check Supabase env vars, project status, and deployment logs."
    );
  }
}
