import type Stripe from 'stripe';
import { verifyEvent } from './signature';

export function processWebhook(payload: string, signature: string): { handled: boolean } {
  const event = verifyEvent(payload, signature);

  switch (event.type) {
    case 'customer.created': {
      const customer = event.data.object as Stripe.Customer;
      const phone = customer.phone;
      const previous = event.data.previous_attributes;
      return { handled: Boolean(phone || previous) };
    }
    case 'customer.updated': {
      const customer = event.data.object as Stripe.Customer;
      return { handled: Boolean(customer.email) };
    }
    default:
      return { handled: false };
  }
}
