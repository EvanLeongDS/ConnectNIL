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
      "Authentication middleware failed. Check Supabase env vars, project status, and deployment logs."
    );
  }
}
