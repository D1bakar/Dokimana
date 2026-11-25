declare module 'stripe' {
  interface Customers {
    update(id: string, parameters: Record<string, unknown>): Promise<unknown>;
  }

  export default class Stripe {
    constructor(apiKey: string);
    customers: Customers;
  }
}
