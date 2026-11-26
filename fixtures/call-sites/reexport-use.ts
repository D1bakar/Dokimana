import { stripe } from './reexport-client.js';

export async function updateViaReexportedClient(id: string): Promise<unknown> {
  return stripe.customers.update(id, {
    legacy_name: 'Ada',
  });
}
