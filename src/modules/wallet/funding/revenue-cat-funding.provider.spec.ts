import { RevenueCatFundingProvider } from './revenue-cat-funding.provider';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';

const baseRequest = {
  walletAccountId: 'wallet-1',
  amount: 50,
  currency: 'USD',
  referenceType: 'revenuecat_donation',
  referenceId: 'ref-1',
  idempotencyKey: 'idem-1',
};

const validItem = {
  id: 'purchase-1',
  product_id: 'donation_50',
  status: 'owned',
  revenue_in_usd: { currency: 'USD', gross: 50 },
  environment: 'production',
  store_purchase_identifier: 'ref-1',
};

function createConfigService(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'revenuecat.projectId': 'project-123',
    'revenuecat.apiKey': 'sk-test-key',
    'revenuecat.allowSandbox': false,
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => config[key]),
  };
}

function mockResponse(data: unknown, status = 200, ok = true) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(data),
  };
}

describe('RevenueCatFundingProvider', () => {
  let provider: RevenueCatFundingProvider;
  let mockFetch: jest.Mock;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      value: mockFetch,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
  });

  function setup(overrides?: Record<string, unknown>) {
    const configService = createConfigService(overrides);
    provider = new RevenueCatFundingProvider(
      configService as unknown as ConfigService<AppConfig, true>,
    );
    return { provider, configService };
  }

  it('exposes a stable provider name of "revenuecat"', () => {
    setup();
    expect(provider.name).toBe('revenuecat');
  });

  it('returns ok=true with externalId on a valid purchase', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({ object: 'list', items: [validItem] }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('purchase-1');
    expect(result.message).toBe('RevenueCat purchase verified successfully');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v2/projects/project-123/purchases?store_purchase_identifier=ref-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      }),
    );
  });

  it('returns ok=false when purchase status is not owned (refunded)', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [{ ...validItem, status: 'refunded', id: undefined }],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('refunded');
  });

  it('returns ok=false when product_id does not match donation pattern', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [{ ...validItem, product_id: 'subscription_123' }],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invalid product ID');
  });

  it('returns ok=false when gross amount exceeds tolerance', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [
          { ...validItem, revenue_in_usd: { currency: 'USD', gross: 60 } },
        ],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Amount mismatch');
  });

  it('returns ok=false when currency does not match', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [
          { ...validItem, revenue_in_usd: { currency: 'EUR', gross: 50 } },
        ],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Currency mismatch');
  });

  it('returns ok=false for sandbox purchases when allowSandbox is false', async () => {
    const { provider } = setup({ 'revenuecat.allowSandbox': false });
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [{ ...validItem, environment: 'sandbox' }],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Sandbox');
  });

  it('allows sandbox purchases when allowSandbox is true', async () => {
    const { provider } = setup({ 'revenuecat.allowSandbox': true });
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [{ ...validItem, environment: 'sandbox' }],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(true);
  });

  it('returns ok=false on non-2xx API response', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(mockResponse({}, 401, false) as any);

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('RevenueCat API error');
  });

  it('returns ok=false on request timeout (AbortError)', async () => {
    const { provider } = setup();
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('RevenueCat API request timeout');
  });

  it('clears the timeout in a finally block on ordinary fetch rejection', async () => {
    const { provider } = setup();
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    mockFetch.mockRejectedValueOnce(new Error('Network down'));

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('throws when projectId is not configured', async () => {
    const { provider } = setup({ 'revenuecat.projectId': undefined });

    await expect(provider.deposit(baseRequest)).rejects.toThrow(
      'RevenueCat projectId not configured',
    );
  });

  it('throws when apiKey is not configured', async () => {
    const { provider } = setup({ 'revenuecat.apiKey': undefined });

    await expect(provider.deposit(baseRequest)).rejects.toThrow(
      'RevenueCat API key not configured',
    );
  });

  it('returns ok=false when no purchase found', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({ object: 'list', items: [] }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('No purchase found');
  });

  it('returns ok=false when multiple purchases found', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [validItem, { ...validItem, id: 'purchase-2' }],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Multiple purchases');
  });

  it('falls back to request.referenceId when purchase.id is absent', async () => {
    const { provider } = setup();
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        object: 'list',
        items: [{ ...validItem, id: undefined }],
      }) as any,
    );

    const result = await provider.deposit(baseRequest);

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('ref-1');
  });
});
