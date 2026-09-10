import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeFundingProvider } from './stripe-funding.provider';
import { AppConfig } from '../../../config/configuration';

jest.mock('stripe', () => {
  const mockPaymentIntents = {
    create: jest.fn().mockResolvedValue({
      id: 'pi_123',
      status: 'succeeded',
      client_secret: 'pi_123_secret_456',
      amount: 2500,
      currency: 'usd',
    }),
  };
  return jest.fn().mockImplementation(() => ({
    paymentIntents: mockPaymentIntents,
  }));
});

describe('StripeFundingProvider', () => {
  let provider: StripeFundingProvider;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        StripeFundingProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.secretKey') return 'sk_test_123';
              return undefined as any;
            }),
          },
        },
      ],
    }).compile();

    provider = moduleRef.get<StripeFundingProvider>(StripeFundingProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('exposes name stripe', () => {
    expect(provider.name).toBe('stripe');
  });

  it('deposit returns ok=true with payment_intent id as externalId', async () => {
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 25,
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'ref-1',
      idempotencyKey: 'idem-1',
      description: 'Test',
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('pi_123');
  });

  it('deposit returns ok=false for invalid amount', async () => {
    const result = await provider.deposit({
      walletAccountId: 'wallet-1',
      amount: 0,
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'ref-1',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Amount must be greater than zero.');
  });

  it('deposit returns ok=false when Stripe throws', async () => {
    const Stripe = require('stripe');
    const mockCreate = jest.fn().mockRejectedValue(new Error('Stripe error'));
    Stripe.mockImplementationOnce(() => ({
      paymentIntents: { create: mockCreate },
    }));

    const module = await Test.createTestingModule({
      providers: [
        StripeFundingProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.secretKey') return 'sk_test_123';
              return undefined as any;
            }),
          },
        },
      ],
    }).compile();

    const p = module.get<StripeFundingProvider>(StripeFundingProvider);
    const result = await p.deposit({
      walletAccountId: 'wallet-1',
      amount: 25,
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'ref-1',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Stripe error');
  });
});
