import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { creditPaidPayment, markSessionFailed } from "@/lib/deals/paymentReconcile";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      // ── Checkout completed ───────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── Deal payment ──────────────────────────────────────────────────────
        const dealPaymentId = session.metadata?.deal_payment_id;
        if (dealPaymentId && session.metadata?.partnership_id) {
          // Was an unconditional increment of partnership.paid_cents. Stripe redelivers
          // this event after any non-2xx, so one transient 500 credited the money twice.
          // creditPaidPayment claims the row and recomputes the total from the paid rows.
          await creditPaidPayment(
            supabase,
            dealPaymentId,
            typeof session.payment_intent === "string" ? session.payment_intent : null
          );
          break;
        }

        // ── Subscription (platform Pro plan) ─────────────────────────────────
        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;

        const subscription = await getStripe().subscriptions.retrieve(
          session.subscription as string
        );
        await supabase.from("subscriptions").upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer as string,
          status: subscription.status,
          price_id: subscription.items.data[0].price.id,
          current_period_start: new Date(
            subscription.current_period_start * 1000
          ).toISOString(),
          current_period_end: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
        });
        break;
      }

      /* ── Checkout ended without payment ──────────────────────────────────────
       * Without these two cases nothing ever wrote `failed`, so an abandoned checkout left
       * the row `processing` and the pay route refused every retry with 409 forever.
       *
       * NOTE: `checkout.session.expired` fires at session expiry (24h by default), not the
       * moment the brand clicks back — it is the backstop. The prompt recovery comes from
       * reconcileDealPayments(), called on the return route and before the pay pre-checks.
       *
       * These events must be enabled on the endpoint in the Stripe dashboard, or this is
       * dead code — see the STRIPE_WEBHOOK_SECRET notes in .env.example for the list. */
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.deal_payment_id) {
          // Guarded inside markSessionFailed against ever un-paying a settled row.
          await markSessionFailed(supabase, session.id);
        }
        break;
      }

      // Defensive today — the pay route requests card only, which settles synchronously —
      // but free to handle, and silently missing it would lose real money.
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const dealPaymentId = session.metadata?.deal_payment_id;
        if (dealPaymentId) {
          await creditPaidPayment(
            supabase,
            dealPaymentId,
            typeof session.payment_intent === "string" ? session.payment_intent : null
          );
        }
        break;
      }

      // ── Subscription updated / cancelled ────────────────────────────────────
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await supabase
          .from("subscriptions")
          .update({
            status: subscription.status,
            current_period_start: new Date(
              subscription.current_period_start * 1000
            ).toISOString(),
            current_period_end: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
