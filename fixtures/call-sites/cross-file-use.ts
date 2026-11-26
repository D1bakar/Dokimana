import { stripe } from './cross-file-client.js';

export async function createCustomerFromImportedClient(email: string): Promise<unknown> {
  return stripe.customers.create({
    email,
    metadata: {
      legacy_name: 'Ada',
    },
  });
}
