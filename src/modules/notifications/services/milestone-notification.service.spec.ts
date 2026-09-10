import { MilestoneType, Prisma } from '@prisma/client';
import { MilestoneNotificationService } from './milestone-notification.service';

describe('MilestoneNotificationService', () => {
  let prisma: any;
  let service: MilestoneNotificationService;

  beforeEach(() => {
    prisma = {
      milestoneNotificationLog: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      campaign: { findUnique: jest.fn() },
    };
    service = new MilestoneNotificationService(prisma);
  });

  describe('shouldNotify', () => {
    it('returns true when no log exists', async () => {
      prisma.milestoneNotificationLog.findFirst.mockResolvedValue(null);

      const result = await service.shouldNotify(
        'campaign-1',
        MilestoneType.p50,
      );

      expect(result).toBe(true);
      expect(prisma.milestoneNotificationLog.findFirst).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1', milestone: MilestoneType.p50 },
        select: { campaignId: true },
      });
    });

    it('returns false when a log already exists', async () => {
      prisma.milestoneNotificationLog.findFirst.mockResolvedValue({
        campaignId: 'campaign-1',
      });

      const result = await service.shouldNotify(
        'campaign-1',
        MilestoneType.p50,
      );

      expect(result).toBe(false);
    });
  });

  describe('markNotified', () => {
    it('creates a new log row', async () => {
      prisma.milestoneNotificationLog.create.mockResolvedValue({
        campaignId: 'campaign-1',
        milestone: MilestoneType.p100,
      });

      const result = await service.markNotified(
        'campaign-1',
        MilestoneType.p100,
      );

      expect(prisma.milestoneNotificationLog.create).toHaveBeenCalledWith({
        data: { campaignId: 'campaign-1', milestone: MilestoneType.p100 },
      });
      expect(result).toEqual({
        campaignId: 'campaign-1',
        milestone: MilestoneType.p100,
      });
    });

    it('is idempotent (does not throw on duplicate)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on milestoneNotificationLog',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      prisma.milestoneNotificationLog.create.mockRejectedValue(p2002);
      prisma.milestoneNotificationLog.findFirstOrThrow.mockResolvedValue({
        campaignId: 'campaign-1',
        milestone: MilestoneType.p50,
        notifiedAt: new Date(),
      });

      const result = await service.markNotified(
        'campaign-1',
        MilestoneType.p50,
      );

      expect(
        prisma.milestoneNotificationLog.findFirstOrThrow,
      ).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1', milestone: MilestoneType.p50 },
      });
      expect(result.campaignId).toBe('campaign-1');
    });

    it('rethrows non-P2002 errors', async () => {
      prisma.milestoneNotificationLog.create.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(
        service.markNotified('campaign-1', MilestoneType.p50),
      ).rejects.toThrow('connection refused');
      expect(
        prisma.milestoneNotificationLog.findFirstOrThrow,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getNotifiedMilestones', () => {
    it('returns an empty array when no logs exist', async () => {
      prisma.milestoneNotificationLog.findMany.mockResolvedValue([]);

      const result = await service.getNotifiedMilestones('campaign-1');

      expect(result).toEqual([]);
      expect(prisma.milestoneNotificationLog.findMany).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1' },
        select: { milestone: true },
      });
    });

    it('returns an array of milestone types when logs exist', async () => {
      prisma.milestoneNotificationLog.findMany.mockResolvedValue([
        { milestone: MilestoneType.p25 },
        { milestone: MilestoneType.p100 },
      ]);

      const result = await service.getNotifiedMilestones('campaign-1');

      expect(result).toEqual([MilestoneType.p25, MilestoneType.p100]);
    });
  });

  describe('getNotifiedMilestonesForCampaigns', () => {
    it('returns a Map with the correct structure', async () => {
      prisma.milestoneNotificationLog.findMany.mockResolvedValue([
        { campaignId: 'c1', milestone: MilestoneType.p25 },
        { campaignId: 'c1', milestone: MilestoneType.p50 },
        { campaignId: 'c2', milestone: MilestoneType.p100 },
      ]);

      const result = await service.getNotifiedMilestonesForCampaigns([
        'c1',
        'c2',
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('c1')).toEqual(
        new Set([MilestoneType.p25, MilestoneType.p50]),
      );
      expect(result.get('c2')).toEqual(new Set([MilestoneType.p100]));
      expect(result.get('missing')).toBeUndefined();
      expect(prisma.milestoneNotificationLog.findMany).toHaveBeenCalledWith({
        where: { campaignId: { in: ['c1', 'c2'] } },
        select: { campaignId: true, milestone: true },
      });
    });

    it('returns an empty Map for empty input', async () => {
      const result = await service.getNotifiedMilestonesForCampaigns([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(prisma.milestoneNotificationLog.findMany).not.toHaveBeenCalled();
    });
  });
});
