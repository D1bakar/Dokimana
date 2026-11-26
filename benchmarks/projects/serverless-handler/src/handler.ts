import type { APIGatewayProxyHandler } from 'aws-lambda';
import type Stripe from 'stripe';
import { isCustomerCreatedEvent } from './event';

export const handler: APIGatewayProxyHandler = async (lambdaEvent) => {
  const event = JSON.parse(lambdaEvent.body ?? '{}') as Stripe.Event;

  if (!isCustomerCreatedEvent(event)) {
    return { statusCode: 204, body: '' };
  }

  const phone = event.data.object.phone;
  return { statusCode: 200, body: JSON.stringify({ phone }) };
};
