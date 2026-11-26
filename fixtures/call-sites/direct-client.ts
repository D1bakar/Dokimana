import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_fixture');

export async function createCustomer(email: string): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    metadata: {
      legacy_name: 'Ada',
    },
  });
}

export async function updateCustomer(id: string): Promise<Stripe.Customer> {
  return stripe.customers.update(id, {
    legacy_name: 'Grace',
  });
}
