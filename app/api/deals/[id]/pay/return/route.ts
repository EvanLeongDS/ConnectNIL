import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { reconcileDealPayments } from "@/lib/deals/paymentReconcile";

export const runtime = "nodejs";

/**
 * GET /api/deals/[id]/pay/return?session_id=...&outcome=success|cancel
 *
 * Stripe's success_url and cancel_url both land here rather than straight on the deal page.
 *
 * Why a route and not just reconciling inside the page's server component: this is a write,
 * and a server component render is the wrong place for one — it would re-run on every
 * refresh and on Next's own prefetches. A route handler fires exactly once, at the moment
 * the brand comes back, which is precisely when we know something changed.
 *
 * It also makes the flow correct in local development, where the Stripe CLI is often not
 * forwarding webhooks at all: the payment is credited on return instead of hanging in
 * `processing` until someone notices.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const outcome = request.nextUrl.searchParams.get("outcome");

  const dealPath = `/dashboard/brand-dashboard/deals/${id}`;
  const back = (status: string) =>
    NextResponse.redirect(new URL(`${dealPath}?payment=${status}`, request.url));

  // Authenticate as the user, not the service role: this endpoint is reached by following a
  // link from Stripe, so it must not act on a deal the caller does not own.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: deal } = await supabase
    .from("partnerships")
    .select("id")
    .eq("id", id)
    .eq("brand_id", user.id)
    .maybeSingle();
  if (!deal) return NextResponse.redirect(new URL("/dashboard", request.url));

  const service = createServiceClient();

  // The brand explicitly walked away, so there is no reason to hold the session open for
  // the resume grace period — expire it now and let reconciliation record the failure.
  if (outcome === "cancel" && sessionId) {
    try {
      await getStripe().checkout.sessions.expire(sessionId);
    } catch {
      // Already expired or already completed. Reconciliation reads the real state next.
    }
  }

  try {
    await reconcileDealPayments(service, id);
  } catch (err) {
    // Never strand the user on an error page over bookkeeping — the webhook is still the
    // backstop, and the deal page renders correctly either way.
    console.error("pay/return: reconcile failed for deal %s:", id, err);
  }

  return back(outcome === "cancel" ? "cancelled" : "success");
}
