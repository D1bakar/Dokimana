import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { stripe } from './client';

type LegacyCustomer = Stripe.Customer & { account_balance?: string };

export const customerRouter = Router();

customerRouter.get('/customers/:id', async (req: Request, res: Response) => {
  const result = await stripe.customers.retrieve(req.params.id);
  if ('deleted' in result) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const customer = result as LegacyCustomer;
  res.status(200).json({
    account_balance: customer.account_balance,
    phone: customer.phone,
  });
});
