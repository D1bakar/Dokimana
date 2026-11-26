import { stripe } from './client';

const method = (['retrieve', 'create'] as const)[0];
const args: unknown[] = [{ expand: ['default_source'] }];

type CustomerMethod = (...values: unknown[]) => Promise<unknown>;

export async function invoke(customerId: string): Promise<unknown> {
  const fn = (stripe.customers as unknown as Record<string, CustomerMethod>)[method];
  return fn(...[...args, customerId]);
}
