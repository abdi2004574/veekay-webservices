import { Injectable } from '@nestjs/common';
import { AgencyStatus, DestinationType, PackageStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAssetsService: MediaAssetsService,
  ) {}

  private async attachViewUrls(packages: any[]) {
    const mediaIds = packages.flatMap(
      (p) => p.media?.map((m: { mediaId: string }) => m.mediaId) ?? [],
    );
    const urlsByMediaId =
      await this.mediaAssetsService.resolveViewUrls(mediaIds);

    return packages.map((pkg) => ({
      ...pkg,
      basePrice: Number(pkg.basePrice),
      media:
        pkg.media?.map((m: { mediaId: string; displayOrder: number }) => ({
          mediaId: m.mediaId,
          displayOrder: m.displayOrder,
          url: urlsByMediaId.get(m.mediaId) ?? null,
        })) ?? [],
      agency: pkg.agency
        ? {
            id: pkg.agency.id,
            agencyName: pkg.agency.agencyName,
            reputationScore:
              pkg.agency.reputationScore === null
                ? null
                : Number(pkg.agency.reputationScore),
          }
        : null,
    }));
  }

  async findOwnedOrThrow(packageId: string, userId: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!agency) {
      throw AppException.forbidden('You must register an agency first.');
    }
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: { id: true, agencyId: true },
    });
    if (!pkg) {
      throw AppException.notFound('Package not found.');
    }
    if (pkg.agencyId !== agency.id) {
      throw AppException.forbidden('You can only manage your own packages.');
    }
    return pkg;
  }

  private async resolveAgencyId(userId: string): Promise<string> {
    const agency = await this.prisma.agency.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!agency) {
      throw AppException.forbidden('Agency account not found.');
    }
    return agency.id;
  }

  private async assertAgencyApproved(agencyId: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { status: true },
    });
    if (!agency || agency.status !== AgencyStatus.approved) {
      throw AppException.forbidden(
        'Your agency must be approved to manage packages.',
      );
    }
  }

  async create(userId: string, dto: CreatePackageDto) {
    const agencyId = await this.resolveAgencyId(userId);
    await this.assertAgencyApproved(agencyId);
    const mediaData =
      dto.mediaMediaIds?.map((mediaId, displayOrder) => ({
        mediaId,
        displayOrder,
      })) ?? [];

    const pkg = await this.prisma.package.create({
      data: {
        agencyId,
        title: dto.title,
        description: dto.description,
        basePrice: dto.basePrice,
        currency: dto.currency,
        destinationType: dto.destinationType,
        season: dto.season,
        theme: dto.theme,
        itinerary: dto.itinerary,
        status: dto.status ?? PackageStatus.active,
        media: { create: mediaData },
      },
      include: {
        media: { orderBy: { displayOrder: 'asc' } },
        agency: {
          select: {
            id: true,
            agencyName: true,
            reputationScore: true,
            status: true,
          },
        },
      },
    });

    const [withUrls] = await this.attachViewUrls([pkg]);
    return withUrls;
  }

  async listMine(userId: string) {
    const agencyId = await this.resolveAgencyId(userId);
    const packages = await this.prisma.package.findMany({
      where: { agencyId },
      orderBy: { createdAt: 'desc' },
      include: {
        media: { orderBy: { displayOrder: 'asc' } },
        agency: {
          select: {
            id: true,
            agencyName: true,
            reputationScore: true,
            status: true,
          },
        },
      },
    });
    return this.attachViewUrls(packages);
  }

  async getDetail(packageId: string, viewerId: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      include: {
        media: { orderBy: { displayOrder: 'asc' } },
        agency: {
          select: {
            id: true,
            agencyName: true,
            reputationScore: true,
            status: true,
          },
        },
      },
    });
    if (!pkg) {
      throw AppException.notFound('Package not found.');
    }

    const viewerAgency = await this.prisma.agency.findUnique({
      where: { userId: viewerId },
      select: { id: true },
    });

    const isOwner = viewerAgency?.id === pkg.agencyId;
    if (pkg.status !== PackageStatus.active && !isOwner) {
      throw AppException.notFound('Package not found.');
    }
    if (!isOwner) {
      const agency = await this.prisma.agency.findUnique({
        where: { id: pkg.agencyId },
        select: { status: true },
      });
      if (!agency || agency.status !== AgencyStatus.approved) {
        throw AppException.notFound('Package not found.');
      }
    }

    const [withUrls] = await this.attachViewUrls([pkg]);
    return withUrls;
  }

  async update(packageId: string, userId: string, dto: UpdatePackageDto) {
    await this.findOwnedOrThrow(packageId, userId);

    const updateData: any = {
      title: dto.title,
      description: dto.description,
      basePrice: dto.basePrice,
      currency: dto.currency,
      destinationType: dto.destinationType,
      season: dto.season,
      theme: dto.theme,
      itinerary: dto.itinerary,
      status: dto.status,
    };

    // Remove undefined keys so Prisma only touches sent fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const pkg = await this.prisma.$transaction(async (tx) => {
      if (dto.mediaMediaIds) {
        await tx.packageMedia.deleteMany({ where: { packageId } });
        await tx.packageMedia.createMany({
          data: dto.mediaMediaIds.map((mediaId, displayOrder) => ({
            packageId,
            mediaId,
            displayOrder,
          })),
        });
      }

      return tx.package.update({
        where: { id: packageId },
        data: updateData,
        include: {
          media: { orderBy: { displayOrder: 'asc' } },
          agency: {
            select: {
              id: true,
              agencyName: true,
              reputationScore: true,
              status: true,
            },
          },
        },
      });
    });

    const [withUrls] = await this.attachViewUrls([pkg]);
    return withUrls;
  }

  async remove(packageId: string, userId: string) {
    await this.findOwnedOrThrow(packageId, userId);
    await this.prisma.package.delete({ where: { id: packageId } });
  }

  async listPublic(
    cursor?: string,
    limit = 20,
    destinationType?: string,
    season?: string,
    theme?: string,
  ) {
    const where: any = {
      status: PackageStatus.active,
      agency: { status: AgencyStatus.approved },
    };
    if (destinationType) {
      where.destinationType = destinationType;
    }
    if (season) {
      where.season = { contains: season, mode: 'insensitive' };
    }
    if (theme) {
      where.theme = { contains: theme, mode: 'insensitive' };
    }

    const packages = await this.prisma.package.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        media: { orderBy: { displayOrder: 'asc' } },
        agency: {
          select: {
            id: true,
            agencyName: true,
            reputationScore: true,
            status: true,
          },
        },
      },
    });

    const hasMore = packages.length > limit;
    const page = hasMore ? packages.slice(0, limit) : packages;
    const items = await this.attachViewUrls(page);

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async linkToCampaign(
    packageId: string,
    campaignId: string,
    travelerId: string,
  ) {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: { id: true, status: true },
    });
    if (!pkg || pkg.status !== PackageStatus.active) {
      throw AppException.notFound('Package not found.');
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, creatorId: true },
    });
    if (!campaign || campaign.creatorId !== travelerId) {
      throw AppException.notFound('Campaign not found.');
    }

    const existing = await this.prisma.packageCampaignLink.findFirst({
      where: { packageId, campaignId },
    });
    if (existing) {
      throw AppException.conflict(
        'This package is already linked to your campaign.',
      );
    }

    await this.prisma.packageCampaignLink.create({
      data: { packageId, campaignId },
    });
  }

  async unlinkFromCampaign(
    packageId: string,
    campaignId: string,
    travelerId: string,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, creatorId: true },
    });
    if (!campaign || campaign.creatorId !== travelerId) {
      throw AppException.notFound('Campaign not found.');
    }

    const link = await this.prisma.packageCampaignLink.findFirst({
      where: { packageId, campaignId },
    });
    if (!link) {
      throw AppException.notFound(
        'This package is not linked to your campaign.',
      );
    }

    await this.prisma.packageCampaignLink.delete({ where: { id: link.id } });
  }
}
