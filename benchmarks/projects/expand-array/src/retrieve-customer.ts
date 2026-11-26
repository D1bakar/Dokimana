import { stripe } from './client';

export async function getCustomer(customerId: string) {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['default_source', 'address'],
  });

  if ('deleted' in customer) return null;
  return customer;
}
