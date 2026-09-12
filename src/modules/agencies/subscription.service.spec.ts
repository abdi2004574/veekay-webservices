import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgencySubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { AgencySubscriptionTier } from '@prisma/client';

jest.mock('stripe', () => {
  const mockCustomers = {
    create: jest.fn().mockResolvedValue({ id: 'cus_123' }),
  };
  const mockSubscriptions = {
    create: jest.fn().mockResolvedValue({
      id: 'sub_123',
      latest_invoice: { payment_intent: { client_secret: 'pi_123_secret' } },
    }),
    list: jest.fn().mockResolvedValue({ data: [] }),
    cancel: jest.fn().mockResolvedValue({ id: 'sub_123', status: 'canceled' }),
  };
  return jest.fn().mockImplementation(() => ({
    customers: mockCustomers,
    subscriptions: mockSubscriptions,
  }));
});

describe('AgencySubscriptionService', () => {
  let service: AgencySubscriptionService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        AgencySubscriptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.secretKey') return 'sk_test_123';
              if (key === 'stripe.subscriptionPrices') {
                return {
                  basic: 'price_basic',
                  premium: 'price_premium',
                  featured: 'price_featured',
                };
              }
              return undefined as any;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            agency: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<AgencySubscriptionService>(
      AgencySubscriptionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createOrUpdateSubscription creates subscription for premium tier', async () => {
    const prisma = moduleRef.get(PrismaService);
    (prisma.agency.findUnique as jest.Mock).mockResolvedValue({
      id: 'agency-1',
      user: { email: 'agency@test.com' },
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (prisma.agency.update as jest.Mock).mockResolvedValue({ id: 'agency-1' });

    const result = await service.createOrUpdateSubscription(
      'agency-1',
      AgencySubscriptionTier.premium,
    );

    expect(result.subscriptionId).toBe('sub_123');
    expect(result.clientSecret).toBe('pi_123_secret');
  });

  it('createOrUpdateSubscription throws when agency not found', async () => {
    const prisma = moduleRef.get(PrismaService);
    (prisma.agency.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.createOrUpdateSubscription(
        'agency-1',
        AgencySubscriptionTier.premium,
      ),
    ).rejects.toThrow('Agency not found');
  });
});
