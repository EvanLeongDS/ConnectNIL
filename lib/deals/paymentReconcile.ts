/**
 * Payment state reconciliation. SERVER ONLY.
 *
 * Every transition of a deal_payments row to `paid`, and every recovery of a stuck one,
 * goes through here — deliberately modelled on lib/deals/deliverableAccess.ts, so the pay
 * route and the Stripe webhook cannot drift apart on rules this important.
 *
 * The bug this exists to fix: the pay route marks a row `processing` BEFORE redirecting to
 * Checkout, and the webhook only ever handled `checkout.session.completed`. Nothing wrote
 * `failed`. So a brand who pressed browser-back left a row stuck in `processing` forever —
 * the route's pre-checks answered 409 "A payment is already in progress" on every retry
 * while the page said "Payment was cancelled. You can try again below." That installment
 * could never be paid again through the product.
 */
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** A Checkout session we created but never saw an outcome for is presumed dead after this. */
const STALE_MS = 10 * 60 * 1000;
/** How long an abandoned but still-open session stays resumable before we expire it. */
const RESUME_GRACE_MS = 30 * 60 * 1000;

export interface ResumablePayment {
  paymentId: string;
  resumeUrl: string;
  deliverableId: string | null;
  installmentNumber: number | null;
}

/**
 * Credit a payment exactly once, then recompute the partnership total from the rows.
 *
 * Both properties matter and neither was true before:
 *
 *   - `.neq("status", "paid")` makes the transition a claim, so only one caller ever sees
 *     it happen. Stripe retries `checkout.session.completed` on any non-2xx response, and
 *     the old handler incremented `paid_cents` unconditionally — so a single transient 500
 *     double-credited the partnership and could flip it to `completed` on half the money.
 *
 *   - Recomputing from `sum(amount_cents) where status = 'paid'` instead of incrementing
 *     makes the total a function of the rows rather than of the event history. It is
 *     idempotent under replay, and it silently repairs partnerships that were already
 *     over-credited by the old code.
 */
export async function creditPaidPayment(
  service: ServiceClient,
  dealPaymentId: string,
  paymentIntentId: string | null
): Promise<void> {
  const { data: claimed, error: claimErr } = await service
    .from("deal_payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    })
    .eq("id", dealPaymentId)
    .neq("status", "paid")
    .select("id, partnership_id")
    .maybeSingle();

  if (claimErr) {
    console.error("creditPaidPayment: claim failed for %s:", dealPaymentId, claimErr);
    throw claimErr; // non-2xx tells Stripe to retry, which is correct here
  }
  // Already credited by an earlier delivery of the same event. Returning without touching
  // paid_cents is the entire point of the claim.
  if (!claimed) return;

  await recomputePartnershipPaid(service, claimed.partnership_id);
}

/** Derives paid_cents / payment_status (and auto-completion) from the paid rows. */
async function recomputePartnershipPaid(
  service: ServiceClient,
  partnershipId: string
): Promise<void> {
  const [{ data: paidRows }, { data: partnership }] = await Promise.all([
    service
      .from("deal_payments")
      .select("amount_cents")
      .eq("partnership_id", partnershipId)
      .eq("status", "paid"),
    service
      .from("partnerships")
      .select("total_value")
      .eq("id", partnershipId)
      .maybeSingle(),
  ]);
  if (!partnership) return;

  const paidCents = (paidRows ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  const totalCents = Math.round((partnership.total_value ?? 0) * 100);
  // A deal with no value cannot be "fully paid" by paying nothing.
  const fullyPaid = totalCents > 0 && paidCents >= totalCents;

  await service
    .from("partnerships")
    .update({
      paid_cents: paidCents,
      payment_status: fullyPaid ? "paid" : paidCents > 0 ? "partial" : "unpaid",
      ...(fullyPaid ? { status: "completed" } : {}),
    })
    .eq("id", partnershipId);
}

/**
 * Bring every unfinished payment on a deal into line with what Stripe actually thinks.
 *
 * This never invents an outcome: each row is resolved from its own `session.status`, so the
 * worst case is that a row stays unresolved for another cycle. Returns the rows that are
 * still legitimately open, so the caller can offer "resume" rather than a dead 409.
 */
export async function reconcileDealPayments(
  service: ServiceClient,
  partnershipId: string
): Promise<ResumablePayment[]> {
  const { data: openRows } = await service
    .from("deal_payments")
    .select("id, status, stripe_checkout_session_id, created_at, deliverable_id, installment_number")
    .eq("partnership_id", partnershipId)
    .in("status", ["pending", "processing"]);

  if (!openRows?.length) return [];

  const stripe = getStripe();
  const resumable: ResumablePayment[] = [];

  for (const row of openRows) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();

    // No session id: the Stripe call never returned. Only give up once it is clearly stale,
    // so we do not race a request that is still in flight.
    if (!row.stripe_checkout_session_id) {
      if (ageMs > STALE_MS) await markFailed(service, row.id);
      continue;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
    } catch (err) {
      // `resource_missing` is what a test/live key mismatch looks like — the session is real,
      // we are simply asking the wrong Stripe account. Failing a genuine payment over that
      // is far worse than leaving a row open, so only give up on clearly stale rows.
      const code = (err as Stripe.errors.StripeError)?.code;
      if (code === "resource_missing" && ageMs > STALE_MS) {
        await markFailed(service, row.id);
      } else if (code !== "resource_missing") {
        console.error("reconcile: could not retrieve session %s:", row.stripe_checkout_session_id, err);
      }
      continue;
    }

    if (session.status === "complete" && session.payment_status === "paid") {
      await creditPaidPayment(
        service,
        row.id,
        typeof session.payment_intent === "string" ? session.payment_intent : null
      );
      continue;
    }

    if (session.status === "expired") {
      await markFailed(service, row.id);
      continue;
    }

    if (session.status === "open") {
      if (ageMs <= RESUME_GRACE_MS && session.url) {
        resumable.push({
          paymentId: row.id,
          resumeUrl: session.url,
          deliverableId: row.deliverable_id,
          installmentNumber: row.installment_number,
        });
      } else {
        // Abandoned long enough that resuming would be confusing. Expiring it in Stripe
        // first keeps the two systems agreeing about what happened.
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch (err) {
          console.error("reconcile: could not expire session %s:", session.id, err);
        }
        await markFailed(service, row.id);
      }
    }
  }

  return resumable;
}

/**
 * `failed` covers both "expired without paying" and "card declined" — the CHECK constraint
 * in 015_deal_payments.sql already allows it, so no migration is needed, and to the brand
 * both mean the same actionable thing: no charge landed, start again.
 *
 * Guarded on the open statuses so a reconciliation racing a webhook can never un-pay a row.
 */
async function markFailed(service: ServiceClient, paymentId: string): Promise<void> {
  await service
    .from("deal_payments")
    .update({ status: "failed" })
    .eq("id", paymentId)
    .in("status", ["pending", "processing"]);
}

/** Resolve a session id to `failed`. Used by the expiry/async-failure webhook events. */
export async function markSessionFailed(
  service: ServiceClient,
  sessionId: string
): Promise<void> {
  await service
    .from("deal_payments")
    .update({ status: "failed" })
    .eq("stripe_checkout_session_id", sessionId)
    .in("status", ["pending", "processing"]);
}
