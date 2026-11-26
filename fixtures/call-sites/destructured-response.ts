import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function readCustomerList() {
  const { data, previous_attributes } = await stripe.customers.list();
  return { first: data[0], previous: previous_attributes };
}
