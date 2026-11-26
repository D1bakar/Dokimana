import type Stripe from 'stripe';
import { stripe } from './client';

export function readFields(
  customer: Stripe.Customer,
  paymentIntent: Stripe.PaymentIntent,
) {
  return {
    balance: customer.balance,
    email: customer.email,
    amount: paymentIntent.amount,
  };
}

export async function loadAndRead(
  customerId: string,
  paymentIntent: Stripe.PaymentIntent,
) {
  const result = await stripe.customers.retrieve(customerId);
  if ('deleted' in result) return null;

  const customer: Stripe.Customer = result;
  return readFields(customer, paymentIntent);
}
