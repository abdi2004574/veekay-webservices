import { Injectable } from '@nestjs/common';
import { CampaignPrivacy, CampaignStatus, GroupMemberRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const CREATOR_SELECT = {
  select: { id: true, username: true, displayName: true },
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAssetsService: MediaAssetsService,
  ) {}

  private async attachViewUrls(campaigns: any[]) {
    const mediaIds = campaigns.flatMap((c) => c.photos.map((p: { mediaId: string }) => p.mediaId));
    const urlsByMediaId = await this.mediaAssetsService.resolveViewUrls(mediaIds);

    return campaigns.map((campaign) => ({
      ...campaign,
      goalAmount: Number(campaign.goalAmount),
      photos: campaign.photos.map((photo: { mediaId: string; position: number }) => ({
        mediaId: photo.mediaId,
        position: photo.position,
        url: urlsByMediaId.get(photo.mediaId) ?? null,
      })),
      // No Donation model yet (#6) — always 0/empty, never faked.
      contributorsCount: 0,
    }));
  }

  private validateDateRange(tripStartDate?: string, tripEndDate?: string | null) {
    if (tripStartDate && tripEndDate && new Date(tripEndDate) < new Date(tripStartDate)) {
      throw AppException.badRequest('Trip end date cannot be before the start date.');
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
        // Group trips are always effectively private — a friend-group's
        // financial ledger, never public discovery — regardless of what the
        // privacy field was sent as.
        privacy: isGroup ? CampaignPrivacy.private : dto.privacy,
        giftMode: dto.giftMode,
        giftOccasion: dto.giftMode ? dto.giftOccasion : null,
        itineraryMediaId: dto.itineraryMediaId,
        agencyQuoteMediaId: dto.agencyQuoteMediaId,
        status: CampaignStatus.active,
        isGroup,
        photos: {
          create: dto.photoMediaIds.map((mediaId, position) => ({ mediaId, position })),
        },
        ...(isGroup
          ? { groupMembers: { create: { userId: creatorId, role: GroupMemberRole.admin } } }
          : {}),
      },
      include: { photos: true },
    });

    const [withUrls] = await this.attachViewUrls([campaign]);
    return withUrls;
  }

  private async findOwnedOrThrow(campaignId: string, creatorId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
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

    const campaign = await this.prisma.$transaction(async (tx) => {
      if (dto.photoMediaIds) {
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
          tripStartDate: dto.tripStartDate ? new Date(dto.tripStartDate) : undefined,
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

    const [withUrls] = await this.attachViewUrls([campaign]);
    return withUrls;
  }

  async remove(campaignId: string, creatorId: string) {
    await this.findOwnedOrThrow(campaignId, creatorId);
    // Donation-existence delete guard belongs to #6 — no Donation model
    // exists yet, so every campaign is freely deletable for now.
    await this.prisma.campaign.delete({ where: { id: campaignId } });
  }

  async listMine(creatorId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    return this.attachViewUrls(campaigns);
  }

  /** Public browse/search — mirrors AgenciesService.listDirectory's cursor+search shape. */
  async listPublic(cursor?: string, limit = 20, search?: string, creatorId?: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        privacy: CampaignPrivacy.public,
        isGroup: false,
        ...(creatorId ? { creatorId } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                { destination: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { photos: { orderBy: { position: 'asc' } }, creator: CREATOR_SELECT },
    });

    const hasMore = campaigns.length > limit;
    const page = hasMore ? campaigns.slice(0, limit) : campaigns;
    const items = await this.attachViewUrls(page);

    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getDetail(campaignId: string, viewerId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { photos: { orderBy: { position: 'asc' } }, creator: CREATOR_SELECT },
    });
    if (!campaign) {
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

  /** Always empty until #6 (Payments/Donations) exists — never faked. */
  async listTopContributors(campaignId: string, viewerId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw AppException.notFound('Campaign not found.');
    }
    if (campaign.privacy === CampaignPrivacy.private && campaign.creatorId !== viewerId) {
      throw AppException.notFound('Campaign not found.');
    }
    return { items: [] };
  }
}
