import Stripe from 'stripe';

type CustomerClient = Pick<Stripe, 'customers'>;

export async function createCustomer(
  client: CustomerClient,
  email: string,
): Promise<Stripe.Customer> {
  return client.customers.create({
    email,
    metadata: {
      legacy_name: 'Ada',
    },
  });
}
