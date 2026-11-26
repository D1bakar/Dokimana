import Stripe from 'stripe';

new Stripe('sk_test_fixture').customers.update('cus_fixture', { legacy_name: 'Ada' });
