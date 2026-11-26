import { stripe } from './client';

type CustomerMethod = (...values: unknown[]) => Promise<unknown>;

export async function dispatch(
  customerId: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const operation = process.env.CUSTOMER_OPERATION ?? 'retrieve';
  const fn = (stripe.customers as unknown as Record<string, CustomerMethod>)[operation];
  return fn(customerId, ...Object.values(params));
}
