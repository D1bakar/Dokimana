import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

type Contact = {
  email?: string | null;
  metadata?: { legacy_name?: string };
};

type EventLike = {
  data?: { object?: { phone?: string | null } };
};

function consume(value: unknown): void {
  void value;
}

export function readOptional(customer: Contact | undefined, event: EventLike | undefined): void {
  const email = customer?.email;
  const legacyName = customer?.metadata?.legacy_name;
  const phone = event?.data?.object?.phone;
  consume({ email, legacyName, phone });
}

export async function readRetrievedCustomer(): Promise<void> {
  const customer = await stripe.customers.retrieve('cus_fixture');
  if ('deleted' in customer) return;
  consume(customer?.email);
  consume(customer?.metadata?.legacy_name);
}
