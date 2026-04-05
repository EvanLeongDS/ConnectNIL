import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
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
          const partnershipId = session.metadata.partnership_id;
          const amountPaidCents = session.amount_total ?? 0;

          // Mark the payment record as paid
          await supabase
            .from("deal_payments")
            .update({
              stripe_payment_intent_id:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              status: "paid",
              paid_at: new Date().toISOString(),
            })
            .eq("id", dealPaymentId);

          // Update partnership paid_cents + overall payment_status
          const { data: partnership } = await supabase
            .from("partnerships")
            .select("total_value, paid_cents")
            .eq("id", partnershipId)
            .maybeSingle();

          if (partnership) {
            const newPaidCents = (partnership.paid_cents ?? 0) + amountPaidCents;
            const totalCents = Math.round((partnership.total_value ?? 0) * 100);
            const paymentStatus = newPaidCents >= totalCents ? "paid" : "partial";

            await supabase
              .from("partnerships")
              .update({
                paid_cents: newPaidCents,
                payment_status: paymentStatus,
                // Automatically mark deal completed when fully paid
                ...(paymentStatus === "paid" ? { status: "completed" } : {}),
              })
              .eq("id", partnershipId);
          }
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
