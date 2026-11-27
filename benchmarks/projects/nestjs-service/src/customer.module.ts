import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { stripeClient, STRIPE_CLIENT } from './stripe-client.provider';

@Module({
  providers: [CustomerService, { provide: STRIPE_CLIENT, useValue: stripeClient }],
  exports: [CustomerService],
})
export class CustomerModule {}
