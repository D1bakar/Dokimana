import Stripe from 'stripe';

export const sharedStripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_fixture');
