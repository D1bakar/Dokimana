import type Stripe from 'stripe';

export type CustomerEvent = Omit<Stripe.Event, 'data'> & {
  data: { object: Stripe.Customer };
};

export function isCustomerCreatedEvent(event: Stripe.Event): event is CustomerEvent {
  return event.type === 'customer.created';
}
