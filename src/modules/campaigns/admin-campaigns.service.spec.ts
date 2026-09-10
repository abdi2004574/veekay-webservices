import {
  CampaignPrivacy,
  CampaignStatus,
  VerificationStatus,
} from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { encodeCursor } from '../../common/utils/cursor-pagination.util';

describe('CampaignsService admin operations', () => {
  let prisma: any;
  let mediaAssetsService: any;
  let adminAuditLogService: any;
  let verifiedBadgesService: any;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = {
      campaign: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    mediaAssetsService = { resolveViewUrls: jest.fn() };
    adminAuditLogService = { record: jest.fn() };
    verifiedBadgesService = { assign: jest.fn(), revoke: jest.fn() };
    service = new CampaignsService(
      prisma,
      mediaAssetsService,
      adminAuditLogService,
      verifiedBadgesService,
    );
  });

  it('filters campaigns and returns the frontend cursor envelope', async () => {
    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    const cursor = encodeCursor({ createdAt, id: 'campaign-1' });
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: 'campaign-2',
        title: 'Paris trip',
        destination: 'Paris',
        goalAmount: 1000,
        raisedAmount: 200,
        currency: 'USD',
        status: CampaignStatus.flagged,
        privacy: CampaignPrivacy.public,
        giftMode: true,
        createdAt,
        updatedAt: new Date('2026-09-10T13:00:00.000Z'),
        verificationNote: 'Suspicious activity',
        creator: {
          id: 'user-1',
          username: 'creator',
          displayName: 'Creator',
          email: 'creator@example.com',
        },
      },
    ]);

    const result = await service.listAdminCampaigns(
      { search: 'Paris', flagged: true },
      cursor,
      10,
    );

    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: CampaignStatus.flagged,
          OR: expect.arrayContaining([
            expect.objectContaining({
              title: expect.objectContaining({ contains: 'Paris' }),
            }),
          ]),
        },
        cursor: { createdAt, id: 'campaign-1' },
        skip: 1,
        take: 11,
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: 'campaign-2',
      goalAmount: 1000,
      raisedAmount: 200,
      isGiftMode: true,
      creator: { email: 'creator@example.com' },
      flaggedAt: new Date('2026-09-10T13:00:00.000Z'),
      flagReason: 'Suspicious activity',
    });
    expect(result.meta).toEqual({
      cursor: expect.any(String),
      hasMore: false,
    });
  });

  it('flags a campaign and records the reason', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'campaign-1',
      status: CampaignStatus.active,
      verificationStatus: VerificationStatus.unverified,
      deletedAt: null,
      creator: { id: 'user-1' },
    });
    prisma.campaign.update.mockResolvedValue({
      id: 'campaign-1',
      title: 'Trip',
      destination: 'Paris',
      goalAmount: 100,
      raisedAmount: 0,
      currency: 'USD',
      status: CampaignStatus.flagged,
      privacy: CampaignPrivacy.public,
      giftMode: false,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      updatedAt: new Date('2026-09-10T13:00:00.000Z'),
      verificationNote: 'Review required',
      creator: {
        id: 'user-1',
        username: 'creator',
        displayName: 'Creator',
        email: 'creator@example.com',
      },
    });

    await service.flagCampaign(
      'campaign-1',
      { reason: 'Review required' },
      'admin-1',
    );

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: {
        status: CampaignStatus.flagged,
        verificationStatus: VerificationStatus.flagged,
        verificationNote: 'Review required',
        verifiedBadgeAssignedAt: null,
      },
      include: { creator: true },
    });
    expect(adminAuditLogService.record).toHaveBeenCalledWith(
      'admin-1',
      'campaign.flagged',
      'campaign',
      'campaign-1',
      'Review required',
    );
  });

  it('unflags a campaign and clears its verification note', async () => {
    prisma.campaign.findUnique.mockResolvedValue({
      id: 'campaign-1',
      status: CampaignStatus.flagged,
      verificationStatus: VerificationStatus.flagged,
      deletedAt: null,
      creator: { id: 'user-1' },
    });
    prisma.campaign.update.mockResolvedValue({
      id: 'campaign-1',
      title: 'Trip',
      destination: 'Paris',
      goalAmount: 100,
      raisedAmount: 0,
      currency: 'USD',
      status: CampaignStatus.active,
      privacy: CampaignPrivacy.public,
      giftMode: false,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      updatedAt: new Date('2026-09-10T13:00:00.000Z'),
      verificationNote: null,
      creator: {
        id: 'user-1',
        username: 'creator',
        displayName: 'Creator',
        email: 'creator@example.com',
      },
    });

    await service.unflagCampaign('campaign-1', 'admin-1');

    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: CampaignStatus.active,
          verificationStatus: VerificationStatus.unverified,
          verificationNote: null,
          verifiedBadgeAssignedAt: null,
        },
      }),
    );
    expect(adminAuditLogService.record).toHaveBeenCalledWith(
      'admin-1',
      'campaign.unflagged',
      'campaign',
      'campaign-1',
    );
  });
});
