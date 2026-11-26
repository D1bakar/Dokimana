import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '../../../../lib/stripe';

type CustomerResult = Stripe.Customer;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const result = await stripe.customers.retrieve(params.id, {
    expand: ['default_source'],
  });

  if ('deleted' in result) {
    return NextResponse.json({ error: 'customer not found' }, { status: 404 });
  }

  const customer: CustomerResult = result;
  return NextResponse.json({
    balance: customer.balance,
    defaultSourceId:
      typeof customer.default_source === 'string'
        ? customer.default_source
        : (customer.default_source?.id ?? null),
  });
}
