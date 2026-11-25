import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function readCustomer() {
  const customer = await stripe.customers.retrieve('cus_fixture');
  return customer.legacy_name;
}

export async function readDestructured() {
  const { legacy_name } = await stripe.customers.retrieve('cus_fixture');
  return legacy_name;
}
