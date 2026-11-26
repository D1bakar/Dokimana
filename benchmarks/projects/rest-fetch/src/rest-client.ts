import type { CreateCustomerRequest } from './types';

export async function createCustomerViaRest(input: CreateCustomerRequest) {
  const body = {
    email: input.email,
    phone: input.phone,
    tax_exempt: 'reverse',
  };

  const response = await fetch('/v1/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response.json();
}
