import Stripe from 'stripe';

export function readCustomerFields(customer: Stripe.Customer): string | null {
  return customer.email ?? customer.metadata.legacy_name ?? null;
}

export function readPaymentIntentFields(intent: Stripe.PaymentIntent): string | null {
  return intent.receipt_email ?? intent.metadata.legacy_name ?? null;
}
