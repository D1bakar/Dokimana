import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function updateCustomer() {
  const params = { legacy_name: 'Ada' };
  return stripe.customers.update('cus_fixture', params);
}
