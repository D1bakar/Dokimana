import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function findLegacyCustomer() {
  return stripe.customers.update('cus_fixture', {
    legacy_name: 'Ada',
  });
}
