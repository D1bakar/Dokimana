import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function createCustomer() {
  return stripe.customers.create({
    address: { line1: '1 Main St' },
    items: [{ sku: 'sku_1', legacy_name: 'Ada' }],
  });
}
