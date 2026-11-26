import { Inject, Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.provider';

@Injectable()
export class CustomerService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  async createFixtureCustomer(email: string): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email,
      invoice_prefix: 'fixture',
      tax_exempt: 'reverse',
    });
  }
}
