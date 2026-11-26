import type { ChangeRecord } from '../domain/types.js';

export interface SdkOperation {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  label: string;
}

const knownOperations = new Map<string, [SdkOperation['method'], string]>([
  ['customers.create', ['POST', '/v1/customers']],
  ['customers.update', ['POST', '/v1/customers/{customer}']],
  ['customers.retrieve', ['GET', '/v1/customers/{customer}']],
  ['customers.list', ['GET', '/v1/customers']],
  ['customers.del', ['DELETE', '/v1/customers/{customer}']],
  ['customers.delete', ['DELETE', '/v1/customers/{customer}']],
  ['paymentIntents.create', ['POST', '/v1/payment_intents']],
  ['paymentIntents.update', ['POST', '/v1/payment_intents/{intent}']],
  ['paymentIntents.retrieve', ['GET', '/v1/payment_intents/{intent}']],
  ['paymentIntents.list', ['GET', '/v1/payment_intents']],
  ['paymentIntents.confirm', ['POST', '/v1/payment_intents/{intent}/confirm']],
  ['paymentIntents.cancel', ['POST', '/v1/payment_intents/{intent}/cancel']],
  ['subscriptions.create', ['POST', '/v1/subscriptions']],
  ['subscriptions.update', ['POST', '/v1/subscriptions/{subscription}']],
  ['subscriptions.retrieve', ['GET', '/v1/subscriptions/{subscription}']],
  ['subscriptions.list', ['GET', '/v1/subscriptions']],
  ['subscriptions.cancel', ['DELETE', '/v1/subscriptions/{subscription}']],
  ['invoices.create', ['POST', '/v1/invoices']],
  ['invoices.update', ['POST', '/v1/invoices/{invoice}']],
  ['invoices.retrieve', ['GET', '/v1/invoices/{invoice}']],
  ['invoices.list', ['GET', '/v1/invoices']],
  ['invoices.finalize', ['POST', '/v1/invoices/{invoice}/finalize']],
  ['charges.create', ['POST', '/v1/charges']],
  ['charges.update', ['POST', '/v1/charges/{charge}']],
  ['charges.retrieve', ['GET', '/v1/charges/{charge}']],
  ['charges.list', ['GET', '/v1/charges']],
  ['refunds.create', ['POST', '/v1/refunds']],
  ['refunds.update', ['POST', '/v1/refunds/{refund}']],
  ['refunds.retrieve', ['GET', '/v1/refunds/{refund}']],
  ['refunds.list', ['GET', '/v1/refunds']],
  ['payouts.create', ['POST', '/v1/payouts']],
  ['payouts.update', ['POST', '/v1/payouts/{payout}']],
  ['payouts.retrieve', ['GET', '/v1/payouts/{payout}']],
  ['payouts.list', ['GET', '/v1/payouts']],
]);

function snakeCase(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function label(method: SdkOperation['method'], path: string): string {
  return `${method} ${path}`;
}

export function mapSdkOperation(chain: string[]): SdkOperation | undefined {
  const parts = chain.filter((part) => part.length > 0);
  if (parts.length < 2) return undefined;
  const key = `${parts[0]}.${parts[1]}`;
  const known = knownOperations.get(key);
  if (known) return { method: known[0], path: known[1], label: label(known[0], known[1]) };
  return undefined;
}

export function operationMatchesChange(
  change: ChangeRecord,
  operation: SdkOperation | undefined,
): boolean {
  if (!operation) return false;
  if (change.operation !== undefined) {
    return normalizeOperation(change.operation) === normalizeOperation(operation.label);
  }
  if (change.eventType !== undefined || change.context === 'webhook_event') return false;
  const resource = snakeCase(change.resource);
  return (
    operation.path.includes(`/${resource}`) ||
    change.resource === operation.path ||
    change.resource === operation.label
  );
}

function normalizeOperation(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}
