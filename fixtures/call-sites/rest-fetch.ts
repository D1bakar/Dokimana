export async function createCustomerViaRest(email: string): Promise<unknown> {
  const body = JSON.stringify({
    email,
    metadata: {
      legacy_name: 'Ada',
    },
  });

  const response = await fetch('/v1/customers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  return response.json();
}
