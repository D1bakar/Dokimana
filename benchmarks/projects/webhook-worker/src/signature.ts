import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_TEST_KEY ?? 'sk_test_fixture');

export function verifyEvent(payload: string, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_fixture',
  );
}
