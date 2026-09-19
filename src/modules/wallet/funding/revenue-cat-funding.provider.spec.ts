import { RevenueCatFundingProvider } from './revenue-cat-funding.provider';

describe('RevenueCatFundingProvider', () => {
  let provider: RevenueCatFundingProvider;

  beforeEach(() => {
    provider = new RevenueCatFundingProvider();
  });

  it('exposes a stable provider name of "revenuecat"', () => {
    expect(provider.name).toBe('revenuecat');
  });

  it('always succeeds on deposit and returns ok=true', async () => {
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 100,
      currency: 'USD',
      referenceType: 'revenuecat_donation',
      referenceId: 'ref-1',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe(
      'RevenueCat funding provider - deposit verified via webhook',
    );
  });

  it('returns an externalId in the revenuecat-<timestamp> shape', async () => {
    const before = Date.now();
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 50,
      currency: 'USD',
      referenceType: 'revenuecat_donation',
      referenceId: 'ref-2',
      idempotencyKey: 'idem-2',
    });
    const after = Date.now();

    expect(result.externalId).toMatch(/^revenuecat-\d+$/);
    const stamp = Number((result.externalId ?? '').split('-')[1]);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it('does not require a description to succeed', async () => {
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 10,
      currency: 'USD',
      referenceType: 'revenuecat_donation',
      referenceId: 'ref-3',
      idempotencyKey: 'idem-3',
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toMatch(/^revenuecat-\d+$/);
  });
});
