import {
  CampaignLifecycleService,
  CampaignStatusFlags,
} from './lifecycle.service';
import { CampaignStatus } from '@prisma/client';

describe('CampaignLifecycleService', () => {
  let prisma: any;
  let service: CampaignLifecycleService;

  beforeEach(() => {
    prisma = {
      campaign: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    service = new CampaignLifecycleService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndTransitionCampaigns', () => {
    it('transitions active campaigns to funded when raisedAmount >= goalAmount', async () => {
      const now = new Date();
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c-1',
          status: CampaignStatus.active,
          raisedAmount: 6000,
          goalAmount: 5000,
          tripEndDate: new Date(now.getTime() + 86400000),
        },
      ]);
      prisma.campaign.update.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.funded,
      });

      const result = await service.checkAndTransitionCampaigns('actor-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        campaignId: 'c-1',
        from: CampaignStatus.active,
        to: CampaignStatus.funded,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('transitions active campaigns to expired when tripEndDate passed and not funded', async () => {
      const now = new Date();
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c-2',
          status: CampaignStatus.active,
          raisedAmount: 1000,
          goalAmount: 5000,
          tripEndDate: new Date(now.getTime() - 86400000),
        },
      ]);
      prisma.campaign.update.mockResolvedValue({
        id: 'c-2',
        status: CampaignStatus.expired,
      });

      const result = await service.checkAndTransitionCampaigns('actor-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        campaignId: 'c-2',
        from: CampaignStatus.active,
        to: CampaignStatus.expired,
      });
    });

    it('skips campaigns that are neither funded nor expired', async () => {
      const now = new Date();
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c-3',
          status: CampaignStatus.active,
          raisedAmount: 1000,
          goalAmount: 5000,
          tripEndDate: new Date(now.getTime() + 86400000),
        },
      ]);

      const result = await service.checkAndTransitionCampaigns('actor-1');

      expect(result).toHaveLength(0);
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('queries only active campaigns', async () => {
      prisma.campaign.findMany.mockResolvedValue([]);

      await service.checkAndTransitionCampaigns('actor-1');

      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: { status: CampaignStatus.active },
      });
    });

    it('does not transition a funded campaign even if trip ended', async () => {
      const now = new Date();
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c-5',
          status: CampaignStatus.active,
          raisedAmount: 6000,
          goalAmount: 5000,
          tripEndDate: new Date(now.getTime() - 86400000),
        },
      ]);
      prisma.campaign.update.mockResolvedValue({
        id: 'c-5',
        status: CampaignStatus.funded,
      });

      const result = await service.checkAndTransitionCampaigns('actor-1');

      expect(result).toHaveLength(1);
      expect(result[0].to).toBe(CampaignStatus.funded);
    });

    it('handles campaigns with no tripEndDate as not expired', async () => {
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c-6',
          status: CampaignStatus.active,
          raisedAmount: 1000,
          goalAmount: 5000,
          tripEndDate: null,
        },
      ]);

      const result = await service.checkAndTransitionCampaigns('actor-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('transitionCampaign', () => {
    it('updates status for a valid transition', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.active,
      });
      prisma.campaign.update.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.funded,
      });

      const result = await service.transitionCampaign(
        'c-1',
        CampaignStatus.funded,
        'actor-1',
      );

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { status: CampaignStatus.funded },
      });
      expect(result.status).toBe(CampaignStatus.funded);
    });

    it('throws for an invalid transition from completed to active', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.completed,
      });

      await expect(
        service.transitionCampaign('c-1', CampaignStatus.active, 'actor-1'),
      ).rejects.toThrow(
        'Invalid campaign status transition from completed to active.',
      );
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('returns existing campaign when newStatus equals current status', async () => {
      const existing = { id: 'c-1', status: CampaignStatus.active };
      prisma.campaign.findUnique.mockResolvedValue(existing);

      const result = await service.transitionCampaign(
        'c-1',
        CampaignStatus.active,
        'actor-1',
      );

      expect(result).toBe(existing);
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('throws when campaign is not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(
        service.transitionCampaign('missing', CampaignStatus.active, 'actor-1'),
      ).rejects.toThrow('Campaign not found.');
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('allows admin to flag an active campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.active,
      });
      prisma.campaign.update.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.flagged,
      });

      const result = await service.transitionCampaign(
        'c-1',
        CampaignStatus.flagged,
        'actor-1',
        'suspicious activity',
      );

      expect(result.status).toBe(CampaignStatus.flagged);
    });

    it('allows under_review to transition back to active', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.under_review,
      });
      prisma.campaign.update.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.active,
      });

      await service.transitionCampaign('c-1', CampaignStatus.active, 'actor-1');

      expect(prisma.campaign.update).toHaveBeenCalled();
    });

    it('rejects direct transition from expired to funded', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.expired,
      });

      await expect(
        service.transitionCampaign('c-1', CampaignStatus.funded, 'actor-1'),
      ).rejects.toThrow(
        'Invalid campaign status transition from expired to funded.',
      );
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
  });

  describe('canWithdraw', () => {
    it('returns true for funded campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.funded,
      });

      expect(await service.canWithdraw('c-1')).toBe(true);
    });

    it('returns true for completed campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.completed,
      });

      expect(await service.canWithdraw('c-1')).toBe(true);
    });

    it('returns false for flagged campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.flagged,
      });

      expect(await service.canWithdraw('c-1')).toBe(false);
    });

    it('returns false for active campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.active,
      });

      expect(await service.canWithdraw('c-1')).toBe(false);
    });

    it('returns false for expired campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.expired,
      });

      expect(await service.canWithdraw('c-1')).toBe(false);
    });

    it('returns false when campaign does not exist', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      expect(await service.canWithdraw('missing')).toBe(false);
    });
  });

  describe('canReceiveDonations', () => {
    it('returns true for active campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.active,
      });

      expect(await service.canReceiveDonations('c-1')).toBe(true);
    });

    it('returns false for funded campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.funded,
      });

      expect(await service.canReceiveDonations('c-1')).toBe(false);
    });

    it('returns false when campaign does not exist', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      expect(await service.canReceiveDonations('missing')).toBe(false);
    });
  });

  describe('getCampaignStatus', () => {
    it('computes flags for an active funded campaign', async () => {
      const now = new Date();
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.active,
        raisedAmount: 6000,
        goalAmount: 5000,
        tripEndDate: new Date(now.getTime() + 86400000),
      });

      const result: CampaignStatusFlags =
        await service.getCampaignStatus('c-1');

      expect(result).toMatchObject({
        isFunded: true,
        isExpired: false,
        isFlagged: false,
        canReceiveDonations: true,
        canWithdraw: false,
      });
    });

    it('computes flags for an active expired campaign', async () => {
      const now = new Date();
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-2',
        status: CampaignStatus.active,
        raisedAmount: 1000,
        goalAmount: 5000,
        tripEndDate: new Date(now.getTime() - 86400000),
      });

      const result: CampaignStatusFlags =
        await service.getCampaignStatus('c-2');

      expect(result).toMatchObject({
        isFunded: false,
        isExpired: true,
        isFlagged: false,
        canReceiveDonations: true,
        canWithdraw: false,
      });
    });

    it('computes flags for a flagged campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-3',
        status: CampaignStatus.flagged,
        raisedAmount: 5000,
        goalAmount: 5000,
        tripEndDate: new Date(),
      });

      const result: CampaignStatusFlags =
        await service.getCampaignStatus('c-3');

      expect(result).toMatchObject({
        isFunded: false,
        isExpired: false,
        isFlagged: true,
        canReceiveDonations: false,
        canWithdraw: false,
      });
    });

    it('computes flags for a funded campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-4',
        status: CampaignStatus.funded,
        raisedAmount: 5000,
        goalAmount: 5000,
        tripEndDate: new Date(),
      });

      const result: CampaignStatusFlags =
        await service.getCampaignStatus('c-4');

      expect(result).toMatchObject({
        isFunded: false,
        isExpired: false,
        isFlagged: false,
        canReceiveDonations: false,
        canWithdraw: true,
      });
    });

    it('computes flags for a completed campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-5',
        status: CampaignStatus.completed,
        raisedAmount: 5000,
        goalAmount: 5000,
        tripEndDate: new Date(),
      });

      const result: CampaignStatusFlags =
        await service.getCampaignStatus('c-5');

      expect(result).toMatchObject({
        isFunded: false,
        isExpired: false,
        isFlagged: false,
        canReceiveDonations: false,
        canWithdraw: true,
      });
    });

    it('throws for non-existent campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.getCampaignStatus('missing')).rejects.toThrow(
        'Campaign not found.',
      );
    });

    it('marks active campaign with goal not yet reached as not funded', async () => {
      const now = new Date();
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-6',
        status: CampaignStatus.active,
        raisedAmount: 1000,
        goalAmount: 5000,
        tripEndDate: new Date(now.getTime() + 86400000),
      });

      const result: CampaignStatusFlags =
        await service.getCampaignStatus('c-6');

      expect(result).toMatchObject({
        isFunded: false,
        isExpired: false,
        canReceiveDonations: true,
        canWithdraw: false,
      });
    });
  });
});
