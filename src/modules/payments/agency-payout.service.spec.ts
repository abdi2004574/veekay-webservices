import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgencyPayoutService } from './agency-payout.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeConnectService } from './stripe-connect.service';
import { WalletService } from '../wallet/wallet.service';
import { AppConfig } from '../../config/configuration';

jest.mock('stripe', () => {
  const mockTransfers = {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'tr_123', amount: 5000, currency: 'usd' }),
    retrieve: jest
      .fn()
      .mockResolvedValue({ id: 'tr_123', amount: 5000, currency: 'usd' }),
  };
  return jest.fn().mockImplementation(() => ({
    transfers: mockTransfers,
  }));
});

describe('AgencyPayoutService', () => {
  let service: AgencyPayoutService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        AgencyPayoutService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.secretKey') return 'sk_test_123';
              return undefined as any;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            agency: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: StripeConnectService,
          useValue: {
            getAccountStatus: jest.fn().mockResolvedValue({
              payoutsEnabled: true,
            }),
          },
        },
        {
          provide: WalletService,
          useValue: {},
        },
      ],
    }).compile();

    service = moduleRef.get<AgencyPayoutService>(AgencyPayoutService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createPayout returns ok=false when agency has no Connect account', async () => {
    const prisma = moduleRef.get(PrismaService);
    (prisma.agency.findUnique as jest.Mock).mockResolvedValue({
      id: 'agency-1',
      stripeConnectAccounts: [],
    });

    const result = await service.createPayout({
      agencyId: 'agency-1',
      amount: 100,
      currency: 'USD',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Stripe Connect account');
  });

  it('createPayout returns ok=false when payouts not enabled', async () => {
    const prisma = moduleRef.get(PrismaService);
    (prisma.agency.findUnique as jest.Mock).mockResolvedValue({
      id: 'agency-1',
      stripeConnectAccounts: [{ stripeAccountId: 'acct_123' }],
    });
    const connectService = moduleRef.get(StripeConnectService);
    (connectService.getAccountStatus as jest.Mock).mockResolvedValue({
      payoutsEnabled: false,
    });

    const result = await service.createPayout({
      agencyId: 'agency-1',
      amount: 100,
      currency: 'USD',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('payouts enabled');
  });

  it('createPayout creates transfer and returns transferId', async () => {
    const prisma = moduleRef.get(PrismaService);
    (prisma.agency.findUnique as jest.Mock).mockResolvedValue({
      id: 'agency-1',
      stripeConnectAccounts: [{ stripeAccountId: 'acct_123' }],
    });

    const result = await service.createPayout({
      agencyId: 'agency-1',
      amount: 100,
      currency: 'USD',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(true);
    expect(result.transferId).toBe('tr_123');
  });
});
