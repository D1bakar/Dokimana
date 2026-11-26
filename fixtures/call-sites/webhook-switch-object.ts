import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_fixture';

function consume(value: unknown): void {
  void value;
}

export function handleCustomerUpdated(rawBody: string, signature: string): void {
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  switch (event.type) {
    case 'customer.updated': {
      consume(event.data.object.phone);
      consume(event.data.object.metadata?.legacy_name);
      break;
    }
    default:
      break;
  }
}
