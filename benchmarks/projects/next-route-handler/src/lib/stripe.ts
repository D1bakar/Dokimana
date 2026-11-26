import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_TEST_KEY ?? 'sk_test_fixture');
