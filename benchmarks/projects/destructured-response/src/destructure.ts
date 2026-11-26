import type Stripe from 'stripe';
import { stripe } from './client';

export async function readCustomerFields(customerId: string) {
  const result = await stripe.customers.retrieve(customerId);
  if ('deleted' in result) return null;

  const { phone, balance, email, metadata }: Stripe.Customer = result;
  return { phone, balance, email, metadata };
}
