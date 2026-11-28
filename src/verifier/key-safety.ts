export type KeySafetyResult =
  { safe: true; keyType: 'test' | 'none' } | { safe: false; reason: string };

export function validateStripeKey(value: string | undefined): KeySafetyResult {
  if (!value) return { safe: true, keyType: 'none' };
  if (containsLiveKey(value)) {
    return {
      safe: false,
      reason:
        'Live Stripe secret keys are forbidden. Remove sk_live and rk_live keys before execution.',
    };
  }
  if (/^sk_test_/i.test(value) || /^rk_test_/i.test(value)) {
    return { safe: true, keyType: 'test' };
  }
  return {
    safe: false,
    reason: 'Unrecognized Stripe key format. Only sk_test_* or rk_test_* keys are accepted.',
  };
}

export function checkSafeTestModeKeys(
  environment: Record<string, string | undefined>,
): KeySafetyResult {
  for (const [name, value] of Object.entries(environment)) {
    if (!value) continue;

    if (containsLiveKey(value)) {
      return {
        safe: false,
        reason:
          'Live Stripe secret keys are forbidden. Remove sk_live and rk_live keys before execution.',
      };
    }

    if (/^STRIPE_(?:SECRET_KEY|API_KEY|RESTRICTED_KEY)$/i.test(name)) {
      const result = validateStripeKey(value);
      if (!result.safe) return { safe: false, reason: `${name}: ${result.reason}` };
    }
  }
  return { safe: true, keyType: 'none' };
}

export function assertSafeTestModeKeys(environment: Record<string, string | undefined>): void {
  const result = checkSafeTestModeKeys(environment);
  if (!result.safe) throw new Error(result.reason);
}

function containsLiveKey(value: string): boolean {
  return /(?:sk|rk)_live(?:[_-]|$)/i.test(value);
}
