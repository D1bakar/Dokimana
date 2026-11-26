import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fixture');

export async function createTaxExemptCustomer(email: string, invoicePrefix: string) {
  return stripe.customers.create({
    email,
    tax_exempt: 'reverse',
    invoice_prefix: invoicePrefix,
    metadata: {
      tax_category: 'eu_reverse_charge',
    },
  });
}
