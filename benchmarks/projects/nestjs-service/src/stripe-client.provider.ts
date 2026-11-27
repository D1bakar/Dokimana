import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const stripeClient: Stripe = new Stripe(process.env.STRIPE_TEST_KEY ?? 'sk_test_fixture');
