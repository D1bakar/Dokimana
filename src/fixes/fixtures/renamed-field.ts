import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');
export async function updateCustomer() {
  return stripe.customers.update('cus_fixture', { legacy_name: 'Ada' });
}
