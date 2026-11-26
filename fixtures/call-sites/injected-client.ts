import Stripe from 'stripe';

export class CustomerService {
  constructor(private readonly client: Stripe) {}

  async create(email: string): Promise<Stripe.Customer> {
    return this.client.customers.create({
      email,
      metadata: {
        legacy_name: 'Ada',
      },
    });
  }
}
