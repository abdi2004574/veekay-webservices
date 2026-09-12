import { Injectable, Logger } from '@nestjs/common';
import {
  CampaignPrivacy,
  CampaignStatus,
  GroupMemberRole,
  NotificationType,
  VerificationStatus,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';
import { VerifiedBadgesService } from '../verified-badges/verified-badges.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AdminCampaignFilterDto } from './dto/admin-campaign-filter.dto';
import { UpdateCampaignFlagDto } from './dto/update-campaign-flag.dto';
import {
  decodeCursor,
  toCursorPage,
} from '../../common/utils/cursor-pagination.util';

const CREATOR_SELECT = {
  select: { id: true, username: true, displayName: true },
};

const NOT_DELETED = { deletedAt: null };

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAssetsService: MediaAssetsService,
    private readonly adminAuditLogService: AdminAuditLogService,
    private readonly verifiedBadgesService: VerifiedBadgesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async attachViewUrls(campaigns: any[]) {
    const mediaIds = campaigns.flatMap((c) =>
      c.photos.map((p: { mediaId: string }) => p.mediaId),
    );
    const urlsByMediaId =
      await this.mediaAssetsService.resolveViewUrls(mediaIds);

    return campaigns.map((campaign) => ({
      ...campaign,
      goalAmount: Number(campaign.goalAmount),
      photos: campaign.photos.map(
        (photo: { mediaId: string; position: number }) => ({
          mediaId: photo.mediaId,
          position: photo.position,
          url: urlsByMediaId.get(photo.mediaId) ?? null,
        }),
      ),
      contributorsCount: 0,
    }));
  }

  private validateDateRange(
    tripStartDate?: string,
    tripEndDate?: string | null,
  ) {
    if (
      tripStartDate &&
      tripEndDate &&
      new Date(tripEndDate) < new Date(tripStartDate)
    ) {
      throw AppException.badRequest(
        'Trip end date cannot be before the start date.',
      );
    }
  }

  async create(creatorId: string, dto: CreateCampaignDto) {
    this.validateDateRange(dto.tripStartDate, dto.tripEndDate);
    const isGroup = !!dto.isGroup;

    const campaign = await this.prisma.campaign.create({
      data: {
        creatorId,
        title: dto.title,
        destination: dto.destination,
        goalAmount: dto.goalAmount,
        story: dto.story,
        tripStartDate: new Date(dto.tripStartDate),
        tripEndDate: dto.tripEndDate ? new Date(dto.tripEndDate) : null,
        privacy: isGroup ? CampaignPrivacy.private : dto.privacy,
        giftMode: dto.giftMode,
        giftOccasion: dto.giftMode ? dto.giftOccasion : null,
        itineraryMediaId: dto.itineraryMediaId,
        agencyQuoteMediaId: dto.agencyQuoteMediaId,
        status: CampaignStatus.active,
        isGroup,
        photos: {
          create: dto.photoMediaIds.map((mediaId, position) => ({
            mediaId,
            position,
          })),
        },
        ...(isGroup
          ? {
              groupMembers: {
                create: { userId: creatorId, role: GroupMemberRole.admin },
              },
            }
          : {}),
      },
      include: { photos: true },
    });

    const [withUrls] = await this.attachViewUrls([campaign]);
    return withUrls;
  }

  private async findOwnedOrThrow(campaignId: string, creatorId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw AppException.notFound('Campaign not found.');
    }
    if (campaign.creatorId !== creatorId) {
      throw AppException.forbidden('You can only manage your own campaigns.');
    }
    return campaign;
  }

  async update(campaignId: string, creatorId: string, dto: UpdateCampaignDto) {
    await this.findOwnedOrThrow(campaignId, creatorId);
    this.validateDateRange(dto.tripStartDate, dto.tripEndDate);

    let orphanedMediaIds: string[] = [];
    const campaign = await this.prisma.$transaction(async (tx) => {
      if (dto.photoMediaIds) {
        const oldPhotos = await tx.campaignPhoto.findMany({
          where: { campaignId },
          select: { mediaId: true },
        });
        const newMediaIds = new Set(dto.photoMediaIds);
        orphanedMediaIds = oldPhotos
          .map((p) => p.mediaId)
          .filter((id) => !newMediaIds.has(id));

        await tx.campaignPhoto.deleteMany({ where: { campaignId } });
        await tx.campaignPhoto.createMany({
          data: dto.photoMediaIds.map((mediaId, position) => ({
            campaignId,
            mediaId,
            position,
          })),
        });
      }

      return tx.campaign.update({
        where: { id: campaignId },
        data: {
          title: dto.title,
          destination: dto.destination,
          goalAmount: dto.goalAmount,
          story: dto.story,
          tripStartDate: dto.tripStartDate
            ? new Date(dto.tripStartDate)
            : undefined,
          tripEndDate:
            dto.tripEndDate === undefined
              ? undefined
              : dto.tripEndDate === null
                ? null
                : new Date(dto.tripEndDate),
          privacy: dto.privacy,
          giftMode: dto.giftMode,
          giftOccasion: dto.giftMode === false ? null : dto.giftOccasion,
          itineraryMediaId: dto.itineraryMediaId,
          agencyQuoteMediaId: dto.agencyQuoteMediaId,
        },
        include: { photos: true },
      });
    });

    if (orphanedMediaIds.length > 0) {
      await this.mediaAssetsService.cleanupMediaAssets(orphanedMediaIds);
    }

    const [withUrls] = await this.attachViewUrls([campaign]);
    return withUrls;
  }

  async remove(campaignId: string, creatorId: string) {
    await this.findOwnedOrThrow(campaignId, creatorId);

    const photos = await this.prisma.campaignPhoto.findMany({
      where: { campaignId },
      select: { mediaId: true },
    });
    const mediaIds = photos.map((p) => p.mediaId);

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        deletedAt: new Date(),
        deletedById: creatorId,
      },
    });

    if (mediaIds.length > 0) {
      await this.mediaAssetsService.cleanupMediaAssets(mediaIds);
    }
  }

  async listMine(creatorId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { creatorId, ...NOT_DELETED },
      orderBy: { createdAt: 'desc' },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    return this.attachViewUrls(campaigns);
  }

  async listPublic(
    cursor?: string,
    limit = 20,
    search?: string,
    creatorId?: string,
  ) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        privacy: CampaignPrivacy.public,
        isGroup: false,
        deletedAt: null,
        ...(creatorId ? { creatorId } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                {
                  destination: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        photos: { orderBy: { position: 'asc' } },
        creator: CREATOR_SELECT,
      },
    });

    const hasMore = campaigns.length > limit;
    const page = hasMore ? campaigns.slice(0, limit) : campaigns;
    const items = await this.attachViewUrls(page);

    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getDetail(campaignId: string, viewerId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        photos: { orderBy: { position: 'asc' } },
        creator: CREATOR_SELECT,
      },
    });
    if (!campaign || campaign.deletedAt !== null) {
      throw AppException.notFound('Campaign not found.');
    }
    const isCreator = campaign.creatorId === viewerId;
    if (campaign.privacy === CampaignPrivacy.private && !isCreator) {
      throw AppException.notFound('Campaign not found.');
    }

    if (!isCreator) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { viewsCount: { increment: 1 } },
      });
      campaign.viewsCount += 1;
    }

    const [withUrls] = await this.attachViewUrls([campaign]);
    return { ...withUrls, isCreator };
  }

  async listTopContributors(campaignId: string, viewerId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign || campaign.deletedAt !== null) {
      throw AppException.notFound('Campaign not found.');
    }
    if (
      campaign.privacy === CampaignPrivacy.private &&
      campaign.creatorId !== viewerId
    ) {
      throw AppException.notFound('Campaign not found.');
    }
    return { items: [] };
  }

  private toAdminCampaign(campaign: any) {
    return {
      id: campaign.id,
      title: campaign.title,
      destination: campaign.destination,
      goalAmount: Number(campaign.goalAmount),
      raisedAmount: Number(campaign.raisedAmount),
      currency: campaign.currency,
      status: campaign.status,
      privacy: campaign.privacy,
      isGiftMode: campaign.giftMode,
      creator: {
        id: campaign.creator.id,
        displayName: campaign.creator.displayName ?? campaign.creator.username,
        email: campaign.creator.email,
      },
      createdAt: campaign.createdAt,
      ...(campaign.status === CampaignStatus.flagged
        ? {
            flaggedAt: campaign.updatedAt,
            flagReason: campaign.verificationNote,
          }
        : {}),
    };
  }

  async listAdminCampaigns(
    filter: AdminCampaignFilterDto,
    cursor?: string,
    limit = 20,
  ) {
    const position = decodeCursor(cursor);
    const search = filter.search?.trim();
    const where: any = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { destination: { contains: search, mode: 'insensitive' } },
              {
                creator: {
                  OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { displayName: { contains: search, mode: 'insensitive' } },
                    { username: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.privacy ? { privacy: filter.privacy } : {}),
      ...(filter.flagged !== undefined
        ? {
            status: filter.flagged
              ? CampaignStatus.flagged
              : { not: CampaignStatus.flagged },
          }
        : {}),
    };

    const campaigns = await this.prisma.campaign.findMany({
      where,
      select: {
        id: true,
        title: true,
        destination: true,
        goalAmount: true,
        raisedAmount: true,
        currency: true,
        status: true,
        privacy: true,
        giftMode: true,
        createdAt: true,
        updatedAt: true,
        verificationNote: true,
        creator: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(position
        ? {
            cursor: { createdAt: position.createdAt, id: position.id },
            skip: 1,
          }
        : {}),
    });
    const page = toCursorPage(campaigns, limit);

    return {
      data: page.items.map((campaign) => this.toAdminCampaign(campaign)),
      meta: { cursor: page.cursor, hasMore: page.hasMore },
    };
  }

  async flagCampaign(
    campaignId: string,
    dto: UpdateCampaignFlagDto,
    actorUserId: string,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { creator: true },
    });
    if (!campaign || campaign.deletedAt !== null) {
      throw AppException.notFound('Campaign not found.');
    }

    const reason = dto.reason?.trim() || null;
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.flagged,
        verificationStatus: VerificationStatus.flagged,
        verificationNote: reason,
        verifiedBadgeAssignedAt: null,
      },
      include: { creator: true },
    });

    await this.adminAuditLogService.record(
      actorUserId,
      'campaign.flagged',
      'campaign',
      campaignId,
      reason ?? undefined,
    );

    try {
      await this.notificationsService.create(campaign.creatorId, {
        type: NotificationType.campaign_flagged,
        title: 'Campaign Flagged',
        body:
          'Your campaign has been flagged for review. Reason: ' +
          (reason ?? 'Not specified'),
        deepLinkTarget: 'campaign',
        deepLinkEntityId: campaignId,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send campaign_flagged notification for campaign ' +
          campaignId +
          ': ' +
          (error as Error).message,
      );
    }

    return this.toAdminCampaign(updated);
  }

  async unflagCampaign(campaignId: string, actorUserId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { creator: true },
    });
    if (!campaign || campaign.deletedAt !== null) {
      throw AppException.notFound('Campaign not found.');
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.active,
        verificationStatus: VerificationStatus.unverified,
        verificationNote: null,
        verifiedBadgeAssignedAt: null,
      },
      include: { creator: true },
    });

    await this.adminAuditLogService.record(
      actorUserId,
      'campaign.unflagged',
      'campaign',
      campaignId,
    );

    try {
      await this.notificationsService.create(campaign.creatorId, {
        type: NotificationType.verification_status,
        title: 'Campaign Review Complete',
        body: 'Your campaign has been reviewed and is no longer flagged.',
        deepLinkTarget: 'campaign',
        deepLinkEntityId: campaignId,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send verification_status notification for campaign ' +
          campaignId +
          ': ' +
          (error as Error).message,
      );
    }

    return this.toAdminCampaign(updated);
  }

  async updateVerificationStatus(
    campaignId: string,
    status: VerificationStatus,
    note?: string,
    actorUserId?: string,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { creator: true },
    });
    if (!campaign) {
      throw AppException.notFound('Campaign not found.');
    }

    const updateData: any = {
      verificationStatus: status,
      verificationNote: note ?? null,
    };

    if (status === VerificationStatus.verified) {
      updateData.verifiedBadgeAssignedAt = new Date();
      await this.prisma.travelerProfile.upsert({
        where: { userId: campaign.creatorId },
        create: {
          userId: campaign.creatorId,
          identityVerified: true,
          verificationStatus: VerificationStatus.verified,
        },
        update: {
          identityVerified: true,
          verificationStatus: VerificationStatus.verified,
        },
      });
      try {
        await this.verifiedBadgesService.assign(actorUserId ?? '', {
          subjectType: 'user',
          subjectId: campaign.creatorId,
        });
      } catch (error) {
        // ignore duplicate badge
      }
    } else if (
      status === VerificationStatus.flagged ||
      status === VerificationStatus.rejected
    ) {
      updateData.verifiedBadgeAssignedAt = null;
      await this.prisma.travelerProfile.update({
        where: { userId: campaign.creatorId },
        data: {
          identityVerified: false,
          verificationStatus: status,
        },
      });
      try {
        const badge = await this.verifiedBadgesService.findActiveBySubject(
          'user',
          campaign.creatorId,
        );
        if (badge) {
          await this.verifiedBadgesService.revoke(actorUserId ?? '', badge.id);
        }
      } catch (error) {
        // ignore no badge
      }
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
      include: {
        photos: { orderBy: { position: 'asc' } },
        creator: { select: { id: true, username: true, displayName: true } },
      },
    });

    await this.adminAuditLogService.record(
      actorUserId ?? '',
      'campaign.verification.updated',
      'campaign',
      campaignId,
      note,
      { previousStatus: campaign.verificationStatus, newStatus: status },
    );

    const [withUrls] = await this.attachViewUrls([updated]);
    return withUrls;
  }
}
