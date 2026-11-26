import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');
const methodName = process.env.STRIPE_CUSTOMER_METHOD ?? 'retrieve';

type DynamicCustomers = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

export async function callDynamicCustomerMethod(
  input: Record<string, unknown>,
): Promise<unknown> {
  const customers = stripe.customers as unknown as DynamicCustomers;
  return customers[methodName](input);
}
