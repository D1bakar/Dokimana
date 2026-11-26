import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function readNestedCustomerFields() {
  const customer = await stripe.customers.retrieve('cus_fixture');
  if ('deleted' in customer) return null;

  return {
    postalCode: customer.address?.postal_code,
    legacyName: customer.metadata?.legacy_name,
  };
}
