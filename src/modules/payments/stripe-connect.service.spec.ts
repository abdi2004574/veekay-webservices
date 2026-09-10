import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeConnectService } from './stripe-connect.service';
import { AppConfig } from '../../config/configuration';

jest.mock('stripe', () => {
  const mockAccounts = {
    create: jest.fn().mockResolvedValue({
      id: 'acct_123',
      capabilities: {
        card_payments: { status: 'active' },
        transfers: { status: 'active' },
      },
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      capabilities: { card_payments: { status: 'active' } },
      requirements: { currently_due: [], due_set: { requirements_due: [] } },
    }),
    update: jest.fn().mockResolvedValue({ id: 'acct_123' }),
    createExternalAccount: jest.fn().mockResolvedValue({
      id: 'ba_123',
      account: 'acct_123',
    }),
    createLoginLink: jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/login' }),
  };
  const mockAccountLinks = {
    create: jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/onboarding' }),
  };
  return jest.fn().mockImplementation(() => ({
    accounts: mockAccounts,
    accountLinks: mockAccountLinks,
  }));
});

describe('StripeConnectService', () => {
  let service: StripeConnectService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        StripeConnectService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.secretKey') return 'sk_test_123';
              if (key === 'appUrl') return 'http://localhost:57800';
              return undefined as any;
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<StripeConnectService>(StripeConnectService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createConnectAccount returns accountId and onboardingUrl', async () => {
    const result = await service.createConnectAccount(
      'user-1',
      'express',
      'US',
    );
    expect(result.accountId).toBe('acct_123');
    expect(result.onboardingUrl).toBe('https://connect.stripe.com/onboarding');
  });

  it('getAccountStatus returns parsed capabilities and flags', async () => {
    const status = await service.getAccountStatus('acct_123');
    expect(status.chargesEnabled).toBe(true);
    expect(status.payoutsEnabled).toBe(true);
    expect(status.capabilities['card_payments']).toBe('active');
  });

  it('createLoginLink returns url', async () => {
    const result = await service.createLoginLink('acct_123');
    expect(result.url).toBe('https://connect.stripe.com/login');
  });

  it('updateAccount sends business details', async () => {
    const result = await service.updateAccount('acct_123', {
      businessType: 'company',
      email: 'test@example.com',
      url: 'https://example.com',
    });
    expect(result.id).toBe('acct_123');
  });

  it('attachExternalAccount returns external account id', async () => {
    const result = await service.attachExternalAccount('acct_123', 'btok_123');
    expect(result.externalAccountId).toBe('ba_123');
  });
});
