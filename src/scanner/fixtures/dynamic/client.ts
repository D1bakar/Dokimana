import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function updateCustomer(params: Record<string, unknown>) {
  return stripe.customers.update('cus_fixture', { ...params, name: 'Ada' });
}
