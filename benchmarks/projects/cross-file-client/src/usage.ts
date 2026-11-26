import type Stripe from 'stripe';
import { stripe } from './stripe-client';

type LegacyCustomer = Stripe.Customer & { account_balance?: string };

export async function createAndRead(customerId: string) {
  const created = await stripe.customers.create({
    tax_exempt: 'reverse',
  });

  const result = await stripe.customers.retrieve(customerId);
  if ('deleted' in result) return null;

  const retrieved = result as LegacyCustomer;
  return { createdId: created.id, accountBalance: retrieved.account_balance };
}
