declare module 'stripe' {
  interface CustomerRecord {
    [key: string]: unknown;
  }

  interface Customers {
    update(id: string, parameters: Record<string, unknown>): Promise<unknown>;
    create(parameters: Record<string, unknown>): Promise<unknown>;
    retrieve(id: string): Promise<CustomerRecord>;
  }

  export default class Stripe {
    constructor(apiKey: string);
    customers: Customers;
  }
}
