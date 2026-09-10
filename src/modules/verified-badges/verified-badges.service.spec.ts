import { VerifiedBadgeSubjectType } from '@prisma/client';
import { VerifiedBadgesService } from './verified-badges.service';

describe('VerifiedBadgesService', () => {
  let prisma: any;
  let adminAuditLogService: any;
  let service: VerifiedBadgesService;

  beforeEach(() => {
    prisma = {
      verifiedBadge: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    adminAuditLogService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    service = new VerifiedBadgesService(prisma, adminAuditLogService);
  });

  describe('assign', () => {
    it('creates a new badge when none exists', async () => {
      prisma.verifiedBadge.findFirst.mockResolvedValue(null);
      prisma.verifiedBadge.create.mockResolvedValue({
        id: 'badge-1',
        subjectType: VerifiedBadgeSubjectType.user,
        subjectId: 'user-1',
        assignedById: 'actor-1',
        assignedAt: new Date(),
        revokedAt: null,
      });

      const result = await service.assign('actor-1', {
        subjectType: VerifiedBadgeSubjectType.user,
        subjectId: 'user-1',
      });

      expect(result.id).toBe('badge-1');
      expect(prisma.verifiedBadge.create).toHaveBeenCalledWith({
        data: {
          subjectType: VerifiedBadgeSubjectType.user,
          subjectId: 'user-1',
          assignedById: 'actor-1',
        },
      });
      expect(adminAuditLogService.record).toHaveBeenCalledWith(
        'actor-1',
        'verified_badge.assigned',
        VerifiedBadgeSubjectType.user,
        'user-1',
      );
    });

    it('rejects duplicate active badge', async () => {
      prisma.verifiedBadge.findFirst.mockResolvedValue({
        id: 'badge-existing',
        subjectType: VerifiedBadgeSubjectType.agency,
        subjectId: 'agency-1',
        assignedById: 'actor-1',
        assignedAt: new Date(),
        revokedAt: null,
      });

      await expect(
        service.assign('actor-1', {
          subjectType: VerifiedBadgeSubjectType.agency,
          subjectId: 'agency-1',
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });

      expect(prisma.verifiedBadge.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('sets revokedAt on the badge', async () => {
      const now = new Date();
      prisma.verifiedBadge.update.mockResolvedValue({
        id: 'badge-1',
        subjectType: VerifiedBadgeSubjectType.user,
        subjectId: 'user-1',
        assignedById: 'actor-1',
        assignedAt: new Date(),
        revokedAt: now,
      });

      const result = await service.revoke('actor-1', 'badge-1');

      expect(result.revokedAt).toEqual(now);
      expect(prisma.verifiedBadge.update).toHaveBeenCalledWith({
        where: { id: 'badge-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(adminAuditLogService.record).toHaveBeenCalledWith(
        'actor-1',
        'verified_badge.revoked',
        VerifiedBadgeSubjectType.user,
        'user-1',
      );
    });
  });

  describe('findAll', () => {
    it('returns all badges ordered by assignedAt desc', async () => {
      const badges = [
        {
          id: 'badge-2',
          subjectType: VerifiedBadgeSubjectType.user,
          subjectId: 'user-2',
          assignedById: 'actor-1',
          assignedAt: new Date('2024-01-02'),
          revokedAt: null,
        },
        {
          id: 'badge-1',
          subjectType: VerifiedBadgeSubjectType.agency,
          subjectId: 'agency-1',
          assignedById: 'actor-1',
          assignedAt: new Date('2024-01-01'),
          revokedAt: null,
        },
      ];
      prisma.verifiedBadge.findMany.mockResolvedValue(badges);

      const result = await service.findAll();

      expect(result).toEqual(badges);
      expect(prisma.verifiedBadge.findMany).toHaveBeenCalledWith({
        orderBy: { assignedAt: 'desc' },
      });
    });
  });

  describe('findActiveBySubject', () => {
    it('returns active badge for a subject', async () => {
      const badge = {
        id: 'badge-1',
        subjectType: VerifiedBadgeSubjectType.user,
        subjectId: 'user-1',
        assignedById: 'actor-1',
        assignedAt: new Date(),
        revokedAt: null,
      };
      prisma.verifiedBadge.findFirst.mockResolvedValue(badge);

      const result = await service.findActiveBySubject(
        VerifiedBadgeSubjectType.user,
        'user-1',
      );

      expect(result).toEqual(badge);
      expect(prisma.verifiedBadge.findFirst).toHaveBeenCalledWith({
        where: {
          subjectType: VerifiedBadgeSubjectType.user,
          subjectId: 'user-1',
          revokedAt: null,
        },
      });
    });

    it('returns null for revoked badge', async () => {
      prisma.verifiedBadge.findFirst.mockResolvedValue(null);

      const result = await service.findActiveBySubject(
        VerifiedBadgeSubjectType.agency,
        'agency-1',
      );

      expect(result).toBeNull();
    });
  });
});
