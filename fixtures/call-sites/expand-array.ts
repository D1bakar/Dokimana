import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function retrieveExpandedCustomer() {
  return stripe.customers.retrieve('cus_fixture', {
    expand: ['default_source', 'address'],
  });
}
