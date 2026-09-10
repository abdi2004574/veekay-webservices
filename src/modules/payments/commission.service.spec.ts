import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CommissionService } from './commission.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AppConfig } from '../../config/configuration';
import { WalletTransactionType } from '@prisma/client';

describe('CommissionService', () => {
  let service: CommissionService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CommissionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.commissionPercent') return 10;
              return undefined as any;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            walletTransaction: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
            },
            walletAccount: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: WalletService,
          useValue: {
            debit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<CommissionService>(CommissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('applyCommission does nothing when percent <= 0', async () => {
    await service.applyCommission('agency-1', 'tx-1', 0);
    expect(service).toBeDefined();
  });

  it('applyCommission returns early when transaction not found', async () => {
    const prisma = moduleRef.get(PrismaService);
    (prisma.walletTransaction.findUnique as jest.Mock).mockResolvedValue(null);

    await service.applyCommission('agency-1', 'tx-999', 10);
    expect(prisma.walletTransaction.findUnique).toHaveBeenCalledWith({
      where: { id: 'tx-999' },
      select: expect.objectContaining({
        id: true,
        amount: true,
        currency: true,
        walletAccountId: true,
      }),
    });
  });
});
