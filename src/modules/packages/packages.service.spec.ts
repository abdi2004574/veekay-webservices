import { DestinationType, PackageStatus } from '@prisma/client';
import { PackagesService } from './packages.service';

describe('PackagesService', () => {
  let prisma: any;
  let mediaAssetsService: any;
  let service: PackagesService;

  beforeEach(() => {
    prisma = {
      package: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      packageMedia: { deleteMany: jest.fn(), createMany: jest.fn() },
      packageCampaignLink: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
      agency: { findUnique: jest.fn() },
      campaign: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    mediaAssetsService = { resolveViewUrls: jest.fn().mockResolvedValue(new Map()) };
    service = new PackagesService(prisma, mediaAssetsService);
  });

  const baseDto = {
    title: 'Bali Beach Getaway',
    description: 'A relaxing 5-day escape.',
    basePrice: 2500,
    currency: 'USD',
    destinationType: DestinationType.beach,
    season: 'summer',
    theme: 'family',
    itinerary: 'Day 1: Arrival.',
    mediaMediaIds: ['media-1'],
  };

  describe('create', () => {
    it('creates a package with ordered media', async () => {
      prisma.package.create.mockResolvedValue({
        id: 'pkg-1',
        agencyId: 'agency-1',
        title: baseDto.title,
        description: baseDto.description,
        basePrice: baseDto.basePrice,
        currency: baseDto.currency,
        destinationType: baseDto.destinationType,
        season: baseDto.season,
        theme: baseDto.theme,
        itinerary: baseDto.itinerary,
        status: PackageStatus.active,
        isDynamicPricing: false,
        media: [],
        agency: null,
      });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      const result = await service.create('agency-1', baseDto as any);

      expect(prisma.package.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agencyId: 'agency-1',
            title: baseDto.title,
            basePrice: baseDto.basePrice,
            status: PackageStatus.active,
            media: { create: [{ mediaId: 'media-1', displayOrder: 0 }] },
          }),
          include: expect.any(Object),
        }),
      );
      expect(result.basePrice).toBe(2500);
    });

    it('defaults status to active when omitted', async () => {
      prisma.package.create.mockResolvedValue({
        id: 'pkg-1',
        agencyId: 'agency-1',
        title: baseDto.title,
        description: null,
        basePrice: baseDto.basePrice,
        currency: 'USD',
        destinationType: null,
        season: null,
        theme: null,
        itinerary: null,
        status: PackageStatus.active,
        isDynamicPricing: false,
        media: [],
        agency: null,
      });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await service.create('agency-1', { title: baseDto.title, basePrice: 100 } as any);

      expect(prisma.package.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PackageStatus.active }),
        }),
      );
    });
  });

  describe('listMine', () => {
    it('returns packages for the agency', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });
      prisma.package.findMany.mockResolvedValue([
        { id: 'pkg-1', media: [], agency: null, basePrice: '100' },
      ]);

      const result = await service.listMine('agency-1');

      expect(result).toHaveLength(1);
      expect(prisma.package.findMany).toHaveBeenCalledWith({
        where: { agencyId: 'agency-1' },
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
    });
  });

  describe('findOwnedOrThrow', () => {
    it('throws not found for a missing package', async () => {
      prisma.package.findUnique.mockResolvedValue(null);

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await expect(service.findOwnedOrThrow('missing', 'agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws forbidden for a package owned by another agency', async () => {
      prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', agencyId: 'agency-2' });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await expect(service.findOwnedOrThrow('pkg-1', 'agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('update', () => {
    it('rejects updating a package you do not own', async () => {
      prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', agencyId: 'agency-2' });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await expect(service.update('pkg-1', 'agency-1', { title: 'New' })).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.package.update).not.toHaveBeenCalled();
    });

    it('replaces the full media list when mediaMediaIds is provided', async () => {
      prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', agencyId: 'agency-1' });
      prisma.package.update.mockResolvedValue({
        id: 'pkg-1',
        media: [],
        agency: null,
        basePrice: '2500',
      });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await service.update('pkg-1', 'agency-1', { mediaMediaIds: ['media-2', 'media-3'] });

      expect(prisma.packageMedia.deleteMany).toHaveBeenCalledWith({ where: { packageId: 'pkg-1' } });
      expect(prisma.packageMedia.createMany).toHaveBeenCalledWith({
        data: [
          { packageId: 'pkg-1', mediaId: 'media-2', displayOrder: 0 },
          { packageId: 'pkg-1', mediaId: 'media-3', displayOrder: 1 },
        ],
      });
    });
  });

  describe('remove', () => {
    it('rejects deleting a package you do not own', async () => {
      prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', agencyId: 'agency-2' });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await expect(service.remove('pkg-1', 'agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.package.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned package', async () => {
      prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', agencyId: 'agency-1' });

      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      await service.remove('pkg-1', 'agency-1');

      expect(prisma.package.delete).toHaveBeenCalledWith({ where: { id: 'pkg-1' } });
    });
  });

  describe('getDetail', () => {
    it('hides an inactive package from a non-owner', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        agencyId: 'agency-2',
        status: PackageStatus.inactive,
        media: [],
        agency: null,
      });
      prisma.agency.findUnique
        .mockResolvedValueOnce({ id: 'agency-1', status: 'approved' })
        .mockResolvedValueOnce({ id: 'agency-2', status: 'approved' });

      await expect(service.getDetail('pkg-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('lets the owner view their own inactive package', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        agencyId: 'agency-1',
        status: PackageStatus.inactive,
        media: [],
        agency: null,
      });
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: 'approved' });

      const result = await service.getDetail('pkg-1', 'user-1');

      expect(result.status).toBe('inactive');
    });

    it('hides a package from a non-owner when the owning agency is not approved', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        agencyId: 'agency-2',
        status: PackageStatus.active,
        media: [],
        agency: null,
      });
      prisma.agency.findUnique
        .mockResolvedValueOnce({ id: 'agency-1', status: 'approved' })
        .mockResolvedValueOnce({ id: 'agency-2', status: 'pending_verification' });

      await expect(service.getDetail('pkg-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('listPublic', () => {

  it('filters to active packages only', async () => {
    prisma.package.findMany.mockResolvedValue([]);

    await service.listPublic();

    expect(prisma.package.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PackageStatus.active, agency: { status: 'approved' } },
      }),
    );
  });

  it('applies optional tag filters', async () => {
    prisma.package.findMany.mockResolvedValue([]);

    await service.listPublic(undefined, 20, DestinationType.beach, 'summer', 'family');

    expect(prisma.package.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PackageStatus.active,
          agency: { status: 'approved' },
          destinationType: DestinationType.beach,
          season: { contains: 'summer', mode: 'insensitive' },
          theme: { contains: 'family', mode: 'insensitive' },
        },
      }),
    );
  });

  it('paginates with a cursor when there are more results than the limit', async () => {
    const page = Array.from({ length: 3 }, (_, i) => ({ id: `pkg-${i}`, media: [], agency: null }));
    prisma.package.findMany.mockResolvedValue(page);

    const result = await service.listPublic(undefined, 2);

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('pkg-1');
  });
});

describe('linkToCampaign', () => {
  it('rejects linking an inactive package', async () => {
    prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', status: PackageStatus.inactive });
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });

    await expect(service.linkToCampaign('pkg-1', 'c-1', 'user-1')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
  });

  it('rejects linking a package to a campaign owned by another traveler', async () => {
    prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', status: PackageStatus.active });
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-2' });

    await expect(service.linkToCampaign('pkg-1', 'c-1', 'user-1')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
  });

  it('rejects duplicate links', async () => {
    prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', status: PackageStatus.active });
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });
    prisma.packageCampaignLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await expect(service.linkToCampaign('pkg-1', 'c-1', 'user-1')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
  });

  it('creates a link when all checks pass', async () => {
    prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', status: PackageStatus.active });
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });
    prisma.packageCampaignLink.findFirst.mockResolvedValue(null);
    prisma.packageCampaignLink.create.mockResolvedValue({ id: 'link-1' });

    await service.linkToCampaign('pkg-1', 'c-1', 'user-1');

    expect(prisma.packageCampaignLink.create).toHaveBeenCalledWith({
      data: { packageId: 'pkg-1', campaignId: 'c-1' },
    });
  });
});

describe('unlinkFromCampaign', () => {
  it('rejects unlinking from a campaign owned by another traveler', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-2' });

    await expect(service.unlinkFromCampaign('pkg-1', 'c-1', 'user-1')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
  });

  it('rejects unlinking a package that is not linked', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });
    prisma.packageCampaignLink.findFirst.mockResolvedValue(null);

    await expect(service.unlinkFromCampaign('pkg-1', 'c-1', 'user-1')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
  });

  it('deletes the link when it exists', async () => {
    prisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', creatorId: 'user-1' });
    prisma.packageCampaignLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await service.unlinkFromCampaign('pkg-1', 'c-1', 'user-1');

    expect(prisma.packageCampaignLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
  });
});

});
