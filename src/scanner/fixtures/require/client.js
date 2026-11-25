/* eslint-disable no-undef */
const Stripe = require('stripe');

const stripe = new Stripe('sk_test_fixture');

module.exports = () => stripe.customers.update('cus_fixture', { legacy_name: 'Ada' });
