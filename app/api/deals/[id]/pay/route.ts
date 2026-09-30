import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { reconcileDealPayments, type ResumablePayment } from "@/lib/deals/paymentReconcile";
import { getStripe } from "@/lib/stripe";
import { computeNumMonths, installmentAmountCents } from "@/lib/deals/types";

const COMMISSION_RATE = 0.05; // 5% ConnectNIL platform fee

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.user_metadata?.role !== "brand-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { deliverable_id?: string; installment_number?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* body is optional */
  }

  const { data: deal } = await supabase
    .from("partnerships")
    .select(
      "id, status, payment_type, total_value, title, team_display_name, payment_status, start_date, end_date, brand_id"
    )
    .eq("id", id)
    .eq("brand_id", user.id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  if (deal.status !== "active") {
    return NextResponse.json(
      { error: "Payments can only be made on active deals." },
      { status: 409 }
    );
  }
  if (!deal.total_value || deal.total_value <= 0) {
    return NextResponse.json({ error: "Deal has no payment value." }, { status: 400 });
  }

  const service = createServiceClient();

  /* Reconcile BEFORE the pre-checks below. They refuse a payment when any row for this deal
   * is still `pending`/`processing`, and nothing used to clear those — so one abandoned
   * checkout permanently blocked that installment with 409 "A payment is already in
   * progress". Now a stale row is resolved against Stripe first, and a genuinely open
   * session comes back as resumable instead of as an obstruction. */
  let resumable: ResumablePayment[] = [];
  try {
    resumable = await reconcileDealPayments(service, id);
  } catch (err) {
    // Reconciliation is a recovery mechanism, not a precondition. If Stripe is unreachable
    // the pre-checks still run against unreconciled data, exactly as they did before.
    console.error("pay: reconcile failed for deal %s:", id, err);
  }

  let amountCents: number;
  let deliverableId: string | null = null;
  let installmentNumber: number | null = null;

  // ── one_time ────────────────────────────────────────────────────────────────
  if (deal.payment_type === "one_time") {
    if (deal.payment_status === "paid") {
      return NextResponse.json({ error: "This deal has already been fully paid." }, { status: 409 });
    }
    const { data: existing } = await service
      .from("deal_payments")
      .select("id, status")
      .eq("partnership_id", id)
      .in("status", ["pending", "processing", "paid"])
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.status === "paid") {
        return NextResponse.json({ error: "This deal has already been paid." }, { status: 409 });
      }
      // Still open in Stripe: hand back the existing session rather than refusing. The
      // brand lands back in the checkout they abandoned, which is what they wanted.
      const resume = resumable.find((r) => r.paymentId === existing.id);
      if (resume) return NextResponse.json({ url: resume.resumeUrl });
      return NextResponse.json({ error: "A payment is already in progress." }, { status: 409 });
    }
    amountCents = Math.round(deal.total_value * 100);

  // ── monthly ─────────────────────────────────────────────────────────────────
  } else if (deal.payment_type === "monthly") {
    const numMonths = computeNumMonths(deal.start_date, deal.end_date);
    installmentNumber =
      typeof body.installment_number === "number" ? body.installment_number : 1;

    if (installmentNumber < 1 || installmentNumber > numMonths) {
      return NextResponse.json(
        { error: `Installment number must be between 1 and ${numMonths}.` },
        { status: 400 }
      );
    }

    const { data: existingInstallment } = await service
      .from("deal_payments")
      .select("id, status")
      .eq("partnership_id", id)
      .eq("installment_number", installmentNumber)
      .in("status", ["pending", "processing", "paid"])
      .maybeSingle();
    if (existingInstallment) {
      if (existingInstallment.status === "paid") {
        return NextResponse.json(
          { error: `Installment ${installmentNumber} has already been paid.` },
          { status: 409 }
        );
      }
      const resume = resumable.find((r) => r.paymentId === existingInstallment.id);
      if (resume) return NextResponse.json({ url: resume.resumeUrl });
      return NextResponse.json(
        { error: "A payment for this installment is already in progress." },
        { status: 409 }
      );
    }
    amountCents = installmentAmountCents(deal.total_value, numMonths, installmentNumber);

  // ── per_deliverable ──────────────────────────────────────────────────────────
  } else if (deal.payment_type === "per_deliverable") {
    if (!body.deliverable_id) {
      return NextResponse.json(
        { error: "deliverable_id is required for per_deliverable payment." },
        { status: 400 }
      );
    }
    const { data: deliverable } = await service
      .from("deliverables")
      .select("id, status")
      .eq("id", body.deliverable_id)
      .eq("partnership_id", id)
      .maybeSingle();
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
    if (deliverable.status !== "approved") {
      return NextResponse.json(
        { error: "Deliverable must be approved before payment." },
        { status: 409 }
      );
    }

    const { data: existingPayment } = await service
      .from("deal_payments")
      .select("id, status")
      .eq("partnership_id", id)
      .eq("deliverable_id", body.deliverable_id)
      .in("status", ["pending", "processing", "paid"])
      .maybeSingle();
    if (existingPayment) {
      if (existingPayment.status === "paid") {
        return NextResponse.json(
          { error: "This deliverable has already been paid." },
          { status: 409 }
        );
      }
      const resume = resumable.find((r) => r.paymentId === existingPayment.id);
      if (resume) return NextResponse.json({ url: resume.resumeUrl });
      return NextResponse.json(
        { error: "A payment for this deliverable is already in progress." },
        { status: 409 }
      );
    }

    deliverableId = body.deliverable_id;

    const { count: delCount } = await service
      .from("deliverables")
      .select("id", { count: "exact", head: true })
      .eq("partnership_id", id);
    const numDeliverables = Math.max(1, delCount ?? 1);
    // Split value evenly; last deliverable absorbs any rounding
    amountCents = Math.floor((deal.total_value * 100) / numDeliverables);

  } else {
    return NextResponse.json({ error: "Unknown payment type." }, { status: 400 });
  }

  const commissionCents = Math.round(amountCents * COMMISSION_RATE);
  const netCents = amountCents - commissionCents;

  // Create a pending payment record before calling Stripe
  const { data: paymentRecord, error: insErr } = await service
    .from("deal_payments")
    .insert({
      partnership_id: id,
      deliverable_id: deliverableId,
      amount_cents: amountCents,
      commission_cents: commissionCents,
      net_cents: netCents,
      status: "pending",
      payment_type: deal.payment_type,
      installment_number: installmentNumber,
    })
    .select("id")
    .single();

  if (insErr || !paymentRecord) {
    console.error("deal_payments insert:", insErr);
    return NextResponse.json({ error: "Could not create payment record." }, { status: 500 });
  }

  // Get or create Stripe customer for this brand
  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  let stripeCustomerId = profile?.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    stripeCustomerId = customer.id;
    await service.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", user.id);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  let productName = deal.title;
  if (deal.payment_type === "monthly" && installmentNumber) {
    productName += ` — Installment #${installmentNumber}`;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: productName,
              description: `NIL Partnership · ${deal.team_display_name ?? "Athlete"} · ConnectNIL 5% platform fee included`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        deal_payment_id: paymentRecord.id,
        partnership_id: id,
        payment_type: deal.payment_type,
        deliverable_id: deliverableId ?? "",
        installment_number: String(installmentNumber ?? ""),
        supabase_user_id: user.id,
      },
      // Both land on the reconciling return route, which resolves the payment against
      // Stripe's own session state before redirecting to the deal page. Going straight to
      // the page meant the success banner could appear while the row was still `processing`.
      success_url: `${siteUrl}/api/deals/${id}/pay/return?outcome=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/api/deals/${id}/pay/return?outcome=cancel&session_id={CHECKOUT_SESSION_ID}`,
    });

    await service
      .from("deal_payments")
      .update({ stripe_checkout_session_id: session.id, status: "processing" })
      .eq("id", paymentRecord.id);

    return NextResponse.json({ url: session.url });
  } catch (stripeErr) {
    console.error("Stripe session create:", stripeErr);
    await service
      .from("deal_payments")
      .update({ status: "failed" })
      .eq("id", paymentRecord.id);
    return NextResponse.json({ error: "Could not create Stripe checkout session." }, { status: 500 });
  }
}
