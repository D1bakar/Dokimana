import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function readAccountBalance(): Promise<number> {
  const customer = await stripe.customers.retrieve('cus_fixture');
  if ('deleted' in customer) return 0;
  return customer.account_balance;
}
