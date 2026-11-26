import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function createWithSpreadParams(params: Stripe.CustomerCreateParams) {
  return stripe.customers.create({ ...params, email: 'fixture@example.com' });
}

export async function createWithSpreadArgs(args: [Stripe.CustomerCreateParams]) {
  return stripe.customers.create(...args);
}
