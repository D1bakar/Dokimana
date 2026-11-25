import { describe, expect, it } from 'vitest';
import { assertSafeTestModeKeys, validateStripeKey } from './key-safety.js';

describe('Stripe key safety', () => {
  it('rejects sk_live keys', () => {
    expect(validateStripeKey('sk_live_123')).toEqual({
      safe: false,
      reason: expect.any(String),
    });
  });

  it('accepts test keys', () => {
    expect(validateStripeKey('sk_test_123').safe).toBe(true);
    expect(validateStripeKey('rk_test_123').safe).toBe(true);
  });

  it('rejects live keys before environment verification', () => {
    expect(() => assertSafeTestModeKeys({ STRIPE_SECRET_KEY: 'sk_live_123' })).toThrow();
  });

  it('does not interpret unrelated secret variables as Stripe keys', () => {
    expect(() => assertSafeTestModeKeys({ OTHER_SECRET: 'opaque-secret-value' })).not.toThrow();
  });

  it('rejects a live key embedded in another environment variable', () => {
    expect(() =>
      assertSafeTestModeKeys({ THIRD_PARTY_CONFIG: 'prefix sk_live_secret suffix' }),
    ).toThrow(/Live Stripe secret keys are forbidden/);
  });
});
