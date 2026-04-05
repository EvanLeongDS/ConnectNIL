import Stripe from "stripe";

let stripeClient: Stripe | undefined;

/** Lazy init so `next build` does not require STRIPE_SECRET_KEY at compile/static analysis time. */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return stripeClient;
}

export const PLANS = {
  FREE: {
    name: "Free",
    priceId: null,
    price: 0,
  },
  PRO: {
    name: "Pro",
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
    price: 1000,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
