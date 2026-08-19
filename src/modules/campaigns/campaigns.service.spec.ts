import { CampaignPrivacy, CampaignStatus, GroupMemberRole } from '@prisma/client';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService', () => {
  let prisma: any;
  let mediaAssetsService: any;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = {
      campaign: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      campaignPhoto: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    mediaAssetsService = { resolveViewUrls: jest.fn().mockResolvedValue(new Map()) };
    service = new CampaignsService(prisma, mediaAssetsService);
  });

  const baseDto = {
    title: 'My Dream Trip to Greece',
    destination: 'Santorini, Greece',
    goalAmount: 5000,
    tripStartDate: '2026-08-15',
    privacy: CampaignPrivacy.public,
    giftMode: false,
    photoMediaIds: ['media-1'],
  };

  describe('create', () => {
    it('rejects an end date before the start date', async () => {
      await expect(
        service.create('user-1', { ...baseDto, tripEndDate: '2026-08-01' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it('creates a campaign with ordered photos and clears giftOccasion when giftMode is off', async () => {
      prisma.campaign.create.mockResolvedValue({
        id: 'c-1',
        creatorId: 'user-1',
        photos: [{ mediaId: 'media-1', position: 0 }],
      });

      await service.create('user-1', { ...baseDto, giftOccasion: 'Birthday' });

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          creatorId: 'user-1',
          status: CampaignStatus.active,
          giftMode: false,
          giftOccasion: null,
          photos: { create: [{ mediaId: 'media-1', position: 0 }] },
        }),
        include: { photos: true },
      });
    });

    it('forces privacy to private and seeds the creator as group admin when isGroup is true', async () => {
      prisma.campaign.create.mockResolvedValue({ id: 'c-1', creatorId: 'user-1', photos: [] });

      await service.create('user-1', { ...baseDto, privacy: CampaignPrivacy.public, isGroup: true });

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          privacy: CampaignPrivacy.private,
          isGroup: true,
          groupMembers: { create: { userId: 'user-1', role: GroupMemberRole.admin } },
        }),
        include: { photos: true },
      });
    });
  });

  describe('update', () => {
    it('rejects editing a campaign you do not own', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'someone-else' });

      await expect(service.update('c-1', 'user-1', { title: 'New' })).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('replaces the full photo set when photoMediaIds is provided', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });
      prisma.campaign.update.mockResolvedValue({ id: 'c-1', photos: [] });

      await service.update('c-1', 'user-1', { photoMediaIds: ['media-2', 'media-3'] });

      expect(prisma.campaignPhoto.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c-1' } });
      expect(prisma.campaignPhoto.createMany).toHaveBeenCalledWith({
        data: [
          { campaignId: 'c-1', mediaId: 'media-2', position: 0 },
          { campaignId: 'c-1', mediaId: 'media-3', position: 1 },
        ],
      });
    });
  });

  describe('remove', () => {
    it('rejects deleting a campaign you do not own', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'someone-else' });

      await expect(service.remove('c-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.campaign.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned campaign with no donation guard (none exist yet)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });

      await service.remove('c-1', 'user-1');

      expect(prisma.campaign.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });
  });

  describe('getDetail', () => {
    it('hides a private campaign from a non-creator', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        creatorId: 'owner-1',
        privacy: CampaignPrivacy.private,
        photos: [],
      });

      await expect(service.getDetail('c-1', 'viewer-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('lets the creator view their own private campaign without a view-count bump', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        creatorId: 'owner-1',
        privacy: CampaignPrivacy.private,
        viewsCount: 3,
        photos: [],
      });

      const result = await service.getDetail('c-1', 'owner-1');

      expect(result.isCreator).toBe(true);
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('increments the view count for a non-creator viewing a public campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        creatorId: 'owner-1',
        privacy: CampaignPrivacy.public,
        viewsCount: 3,
        photos: [],
      });

      const result = await service.getDetail('c-1', 'viewer-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { viewsCount: { increment: 1 } },
      });
      expect(result.isCreator).toBe(false);
      expect(result.viewsCount).toBe(4);
    });
  });

  describe('listTopContributors', () => {
    it('always returns an empty list — no Donation model exists yet', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        creatorId: 'owner-1',
        privacy: CampaignPrivacy.public,
      });

      await expect(service.listTopContributors('c-1', 'viewer-1')).resolves.toEqual({ items: [] });
    });

    it('hides a private campaign from a non-creator', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        creatorId: 'owner-1',
        privacy: CampaignPrivacy.private,
      });

      await expect(service.listTopContributors('c-1', 'viewer-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('listPublic', () => {
    it('filters to public campaigns only, by default', async () => {
      prisma.campaign.findMany.mockResolvedValue([]);

      await service.listPublic();

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { privacy: CampaignPrivacy.public, isGroup: false },
        }),
      );
    });

    it('adds a creatorId filter when provided', async () => {
      prisma.campaign.findMany.mockResolvedValue([]);

      await service.listPublic(undefined, 20, undefined, 'creator-1');

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { privacy: CampaignPrivacy.public, isGroup: false, creatorId: 'creator-1' },
        }),
      );
    });

    it('adds a title/destination search filter when provided', async () => {
      prisma.campaign.findMany.mockResolvedValue([]);

      await service.listPublic(undefined, 20, 'santorini');

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            privacy: CampaignPrivacy.public,
            isGroup: false,
            OR: [
              { title: { contains: 'santorini', mode: 'insensitive' } },
              { destination: { contains: 'santorini', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('paginates with a cursor when there are more results than the limit', async () => {
      const page = Array.from({ length: 3 }, (_, i) => ({ id: `c-${i}`, photos: [] }));
      prisma.campaign.findMany.mockResolvedValue(page);

      const result = await service.listPublic(undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('c-1');
    });
  });
});
