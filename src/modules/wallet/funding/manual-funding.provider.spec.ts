import { ManualFundingProvider } from './manual-funding.provider';

describe('ManualFundingProvider', () => {
  let provider: ManualFundingProvider;

  beforeEach(() => {
    provider = new ManualFundingProvider();
  });

  it('exposes a stable provider name of "manual"', () => {
    expect(provider.name).toBe('manual');
  });

  it('always succeeds on deposit and returns ok=true', async () => {
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 100,
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'ref-1',
      idempotencyKey: 'idem-1',
      description: 'Test credit',
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Manual credit by admin');
  });

  it('returns an externalId in the manual-<timestamp> shape', async () => {
    const before = Date.now();
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 50,
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'ref-2',
      idempotencyKey: 'idem-2',
    });
    const after = Date.now();

    expect(result.externalId).toMatch(/^manual-\d+$/);
    const stamp = Number((result.externalId ?? '').split('-')[1]);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it('does not require a description to succeed', async () => {
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 10,
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'ref-3',
      idempotencyKey: 'idem-3',
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toMatch(/^manual-\d+$/);
  });
});
