import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { stripe } from './client';

export const customerRouter = Router();

interface CreateCustomerBody {
  email: string;
  phone: string;
  metadata: Record<string, string>;
  tax_exempt: Stripe.CustomerCreateParams.TaxExempt;
}

customerRouter.post('/customers', async (req: Request, res: Response) => {
  const { email, phone, metadata, tax_exempt } = req.body as CreateCustomerBody;

  const customer = await stripe.customers.create({
    email,
    phone,
    metadata,
    tax_exempt,
  });

  res.status(200).json({ id: customer.id });
});
