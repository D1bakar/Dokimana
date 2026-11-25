import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

const otherClient = {
  update: (...args: unknown[]) => args.length,
};

export async function run() {
  await otherClient.update('id', { legacy_name: 'not a Stripe call' });
  await stripe.customers.update('cus_fixture', {
    legacy_name_suffix: 'x',
    not_legacy_name: 'y',
    name: 'Ada',
  });
}
