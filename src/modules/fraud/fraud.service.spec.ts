import {
  FraudFlag,
  FraudFlagStatus,
  FraudFlagSeverity,
  FraudFlagType,
} from '@prisma/client';
import { FraudService } from './fraud.service';

describe('FraudService', () => {
  let prisma: any;
  let configService: any;
  let auditLogService: any;
  let service: FraudService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      travelerProfile: {},
      fraudFlag: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      withdrawalRequest: {
        findMany: jest.fn(),
      },
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'fraud.profileChangeThreshold') return 3;
        if (key === 'fraud.profileChangeWindowDays') return 7;
        if (key === 'wallet.highValueWithdrawalThreshold') return 1000;
        return undefined;
      }),
    };

    auditLogService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    service = new FraudService(prisma, configService, auditLogService);
  });

  describe('create', () => {
    it('creates fraud flag with default severity', async () => {
      prisma.fraudFlag.create.mockResolvedValue({
        id: 'flag-1',
        userId: 'user-1',
        type: FraudFlagType.payment_method_mismatch,
        severity: FraudFlagSeverity.low,
        description: 'Test',
        status: FraudFlagStatus.open,
        reviewedById: null,
        reviewedAt: null,
        resolutionNote: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create('user-1', {
        type: FraudFlagType.payment_method_mismatch,
        description: 'Test',
      });

      expect(result.id).toBe('flag-1');
      expect(result.severity).toBe(FraudFlagSeverity.low);
      expect(prisma.fraudFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            type: FraudFlagType.payment_method_mismatch,
            severity: FraudFlagSeverity.low,
            description: 'Test',
            metadata: undefined,
          }),
        }),
      );
    });

    it('creates fraud flag with parsed metadata JSON', async () => {
      prisma.fraudFlag.create.mockResolvedValue({
        id: 'flag-2',
        userId: 'user-1',
        type: FraudFlagType.frequent_profile_changes,
        severity: FraudFlagSeverity.low,
        description: 'Test',
        status: FraudFlagStatus.open,
        reviewedById: null,
        reviewedAt: null,
        resolutionNote: null,
        metadata: { key: 'value' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create('user-1', {
        type: FraudFlagType.frequent_profile_changes,
        description: 'Test',
        metadata: JSON.stringify({ key: 'value' }),
      });

      expect(result.id).toBe('flag-2');
      expect(prisma.fraudFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { key: 'value' },
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated flags with filters', async () => {
      const flags = [
        {
          id: 'flag-3',
          type: FraudFlagType.payment_method_mismatch,
          status: FraudFlagStatus.open,
          user: { id: 'user-3', username: 'u3', email: 'u3@test.com' },
          reviewedBy: null,
          createdAt: new Date('2024-01-03'),
        },
        {
          id: 'flag-2',
          type: FraudFlagType.withdrawal_anomaly,
          status: FraudFlagStatus.reviewing,
          user: { id: 'user-2', username: 'u2', email: 'u2@test.com' },
          reviewedBy: null,
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'flag-1',
          type: FraudFlagType.payment_method_mismatch,
          status: FraudFlagStatus.open,
          user: { id: 'user-1', username: 'u1', email: 'u1@test.com' },
          reviewedBy: null,
          createdAt: new Date('2024-01-01'),
        },
      ];
      prisma.fraudFlag.findMany.mockResolvedValue(flags);

      const result = await service.findAll(
        { type: FraudFlagType.payment_method_mismatch },
        undefined,
        2,
      );

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('flag-2');
      expect(prisma.fraudFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: FraudFlagType.payment_method_mismatch },
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: expect.any(Object),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a flag by id', async () => {
      const flag = {
        id: 'flag-1',
        userId: 'user-1',
        type: FraudFlagType.payment_method_mismatch,
        severity: FraudFlagSeverity.medium,
        description: 'Test',
        status: FraudFlagStatus.open,
        reviewedById: null,
        reviewedAt: null,
        resolutionNote: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'user-1', username: 'u1', email: 'u1@test.com' },
        reviewedBy: null,
      };
      prisma.fraudFlag.findUnique.mockResolvedValue(flag);

      const result = await service.findOne('flag-1');

      expect(result.id).toBe('flag-1');
      expect(prisma.fraudFlag.findUnique).toHaveBeenCalledWith({
        where: { id: 'flag-1' },
        include: expect.any(Object),
      });
    });

    it('throws not found for missing flag', async () => {
      prisma.fraudFlag.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-flag')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.fraudFlag.findUnique).toHaveBeenCalledWith({
        where: { id: 'missing-flag' },
        include: expect.any(Object),
      });
    });
  });

  describe('review', () => {
    it('updates flag and records audit log', async () => {
      prisma.fraudFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        status: FraudFlagStatus.open,
        userId: 'user-1',
        type: FraudFlagType.payment_method_mismatch,
        severity: FraudFlagSeverity.medium,
        description: 'Test',
        reviewedById: null,
        reviewedAt: null,
        resolutionNote: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.fraudFlag.update.mockResolvedValue({
        id: 'flag-1',
        status: FraudFlagStatus.resolved,
        resolutionNote: 'All good',
        reviewedById: 'admin-1',
        reviewedAt: new Date(),
      });

      const result = await service.review('admin-1', 'flag-1', {
        status: FraudFlagStatus.resolved,
        resolutionNote: 'All good',
      });

      expect(result.status).toBe(FraudFlagStatus.resolved);
      expect(result.resolutionNote).toBe('All good');
      expect(prisma.fraudFlag.update).toHaveBeenCalledWith({
        where: { id: 'flag-1' },
        data: {
          status: FraudFlagStatus.resolved,
          resolutionNote: 'All good',
          reviewedById: 'admin-1',
          reviewedAt: expect.any(Date),
        },
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        'admin-1',
        'fraud.flag.reviewed',
        'fraud_flag',
        'flag-1',
        'All good',
        {
          previousStatus: FraudFlagStatus.open,
          newStatus: FraudFlagStatus.resolved,
        },
      );
    });
  });

  describe('checkFrequentProfileChanges', () => {
    it('creates flag when updates exceed threshold', async () => {
      prisma.user.count.mockResolvedValue(5);

      prisma.fraudFlag.create.mockResolvedValue({
        id: 'flag-3',
        userId: 'user-1',
        type: FraudFlagType.frequent_profile_changes,
        severity: FraudFlagSeverity.low,
        description:
          'User profile updated 5 times in the last 7 days (threshold: 3).',
        status: FraudFlagStatus.open,
        reviewedById: null,
        reviewedAt: null,
        resolutionNote: null,
        metadata: { updatesInWindow: 5, threshold: 3, windowDays: 7 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.checkFrequentProfileChanges('user-1');

      expect(result).not.toBeNull();
      expect(result?.type).toBe(FraudFlagType.frequent_profile_changes);
      expect(prisma.fraudFlag.create).toHaveBeenCalled();
    });

    it('returns null when within threshold', async () => {
      prisma.user.count.mockResolvedValue(2);

      const result = await service.checkFrequentProfileChanges('user-1');

      expect(result).toBeNull();
      expect(prisma.fraudFlag.create).not.toHaveBeenCalled();
    });
  });
});
