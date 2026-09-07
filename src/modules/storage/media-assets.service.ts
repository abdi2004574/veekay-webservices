import { Injectable } from '@nestjs/common';
import {
  MediaPurpose,
  MediaStatus,
  ProfileVisibility,
  AgencyStatus,
  PackageStatus,
  CampaignPrivacy,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import {
  MEDIA_PURPOSE_RULES,
  extensionForContentType,
} from './media-purpose-rules';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class MediaAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly friendsService: FriendsService,
  ) {}

  async createUploadUrl(ownerId: string, dto: CreateUploadUrlDto) {
    const rule = MEDIA_PURPOSE_RULES[dto.purpose];
    if (!rule.contentTypes.includes(dto.contentType)) {
      throw AppException.badRequest(
        `Content type "${dto.contentType}" isn'\''t allowed for ${dto.purpose}. Allowed: ${rule.contentTypes.join("'", "'")}.`,
      );
    }

    const mediaId = randomUUID();
    const ext = extensionForContentType(dto.contentType);
    const key = `${dto.purpose}/${ownerId}/${mediaId}.${ext}`;

    await this.prisma.mediaAsset.create({
      data: {
        id: mediaId,
        ownerId,
        purpose: dto.purpose,
        key,
        contentType: dto.contentType,
      },
    });

    const uploadUrl = await this.storageService.createPresignedUploadUrl(key);
    return { uploadUrl, mediaId, key };
  }

  async confirmUpload(ownerId: string, mediaId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });
    if (!asset) {
      throw AppException.notFound('Media asset not found.');
    }
    if (asset.ownerId !== ownerId) {
      throw AppException.forbidden('You can only confirm your own uploads.');
    }
    if (asset.status !== MediaStatus.pending) {
      throw AppException.businessRule(
        'This upload has already been confirmed.',
      );
    }

    const metadata = await this.storageService.getObjectMetadata(asset.key);
    if (!metadata) {
      throw AppException.notFound(
        'The file was not found in storage — upload it to the presigned URL before confirming.',
      );
    }

    const rule = MEDIA_PURPOSE_RULES[asset.purpose];
    if (!rule.contentTypes.includes(metadata.contentType)) {
      await this.storageService.deleteObject(asset.key);
      await this.prisma.mediaAsset.update({
        where: { id: mediaId },
        data: { status: MediaStatus.deleted },
      });
      throw AppException.badRequest(
        `File content type "${metadata.contentType}" is not allowed for ${asset.purpose}. Allowed: ${rule.contentTypes.join(', ')}.`,
      );
    }

    if (metadata.size > rule.maxSizeBytes) {
      await this.storageService.deleteObject(asset.key);
      await this.prisma.mediaAsset.update({
        where: { id: mediaId },
        data: { status: MediaStatus.deleted },
      });
      throw AppException.badRequest(
        `File exceeds the ${Math.floor(rule.maxSizeBytes / (1024 * 1024))}MB limit for ${asset.purpose}.`,
      );
    }

    return this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: { status: MediaStatus.uploaded, sizeBytes: metadata.size },
    });
  }

  async getViewUrl(
    viewerId: string,
    mediaId: string,
    context: { entityType: string; entityId: string },
  ): Promise<string> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });
    if (!asset || asset.status !== MediaStatus.uploaded) {
      throw AppException.notFound('Media asset not found.');
    }

    await this.assertViewAccess(viewerId, asset, context);

    return this.storageService.createPresignedDownloadUrl(asset.key);
  }

  private async assertViewAccess(
    viewerId: string,
    asset: any,
    context: { entityType: string; entityId: string },
  ): Promise<void> {
    switch (asset.purpose) {
      case MediaPurpose.agency_document: {
        const doc = await this.prisma.agencyDocument.findFirst({
          where: { mediaId: asset.id, agencyId: context.entityId },
        });
        if (!doc) throw AppException.notFound('Media asset not found.');
        if (asset.ownerId !== viewerId)
          throw AppException.forbidden('You cannot view this media.');
        break;
      }

      case MediaPurpose.campaign_photo: {
        const photo = await this.prisma.campaignPhoto.findFirst({
          where: { mediaId: asset.id, campaignId: context.entityId },
        });
        if (!photo) throw AppException.notFound('Media asset not found.');
        const campaign = await this.prisma.campaign.findUnique({
          where: { id: context.entityId },
          select: { creatorId: true, privacy: true },
        });
        if (!campaign) throw AppException.notFound('Media asset not found.');
        if (
          campaign.creatorId === viewerId ||
          campaign.privacy === CampaignPrivacy.public
        ) {
          return;
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.package_visual: {
        const pkgMedia = await this.prisma.packageMedia.findFirst({
          where: { mediaId: asset.id, packageId: context.entityId },
        });
        if (!pkgMedia) throw AppException.notFound('Media asset not found.');
        const pkg = await this.prisma.package.findUnique({
          where: { id: context.entityId },
          include: { agency: true },
        });
        if (!pkg) throw AppException.notFound('Media asset not found.');
        if (pkg.agency.userId === viewerId) {
          return;
        }
        if (
          pkg.status === PackageStatus.active &&
          pkg.agency.status === AgencyStatus.approved
        ) {
          return;
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.post_media: {
        const post = await this.prisma.post.findFirst({
          where: { imageMediaId: asset.id },
        });
        if (!post) throw AppException.notFound('Media asset not found.');
        if (post.authorId === viewerId) {
          return;
        }
        const isFriend = await this.friendsService.areFriends(
          viewerId,
          post.authorId,
        );
        if (isFriend) {
          return;
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.story_media: {
        const story = await this.prisma.story.findFirst({
          where: { imageMediaId: asset.id },
        });
        if (!story) throw AppException.notFound('Media asset not found.');
        if (story.expiresAt < new Date()) {
          throw AppException.forbidden('You cannot view this media.');
        }
        if (story.authorId === viewerId) {
          return;
        }
        const isFriend = await this.friendsService.areFriends(
          viewerId,
          story.authorId,
        );
        if (isFriend) {
          return;
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.chat_image:
      case MediaPurpose.chat_document: {
        const message = await this.prisma.message.findFirst({
          where: { mediaId: asset.id },
          include: { conversation: true },
        });
        if (!message) throw AppException.notFound('Media asset not found.');
        const participant = await this.prisma.conversationParticipant.findFirst(
          {
            where: {
              conversationId: message.conversationId,
              userId: viewerId,
              leftAt: null,
            },
          },
        );
        if (participant) {
          return;
        }
        if (
          message.conversation.type === 'agency' &&
          message.conversation.agencyId
        ) {
          const staff = await this.prisma.agencyStaff.findFirst({
            where: {
              agencyId: message.conversation.agencyId,
              userId: viewerId,
            },
          });
          if (staff) {
            return;
          }
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.profile_photo: {
        const profile = await this.prisma.travelerProfile.findFirst({
          where: { photoMediaId: asset.id },
          include: { user: { include: { privacySetting: true } } },
        });
        if (!profile) throw AppException.notFound('Media asset not found.');
        if (profile.userId === viewerId) {
          return;
        }
        const privacy =
          profile.user.privacySetting?.profileVisibility ??
          ProfileVisibility.public;
        if (privacy === ProfileVisibility.public) {
          return;
        }
        if (privacy === ProfileVisibility.friends) {
          const isFriend = await this.friendsService.areFriends(
            viewerId,
            profile.userId,
          );
          if (isFriend) {
            return;
          }
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.previous_trip_photo: {
        const tripPhoto = await this.prisma.travelerPreviousTripPhoto.findFirst(
          {
            where: { mediaId: asset.id },
            include: {
              travelerProfile: {
                include: { user: { include: { privacySetting: true } } },
              },
            },
          },
        );
        if (!tripPhoto) throw AppException.notFound('Media asset not found.');
        if (tripPhoto.userId === viewerId) {
          return;
        }
        const privacy =
          tripPhoto.travelerProfile.user.privacySetting?.profileVisibility ??
          ProfileVisibility.public;
        if (privacy === ProfileVisibility.public) {
          return;
        }
        if (privacy === ProfileVisibility.friends) {
          const isFriend = await this.friendsService.areFriends(
            viewerId,
            tripPhoto.userId,
          );
          if (isFriend) {
            return;
          }
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.agency_logo: {
        const agency = await this.prisma.agency.findFirst({
          where: { logoMediaId: asset.id, id: context.entityId },
        });
        if (!agency) throw AppException.notFound('Media asset not found.');
        if (agency.status === AgencyStatus.approved) {
          return;
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      case MediaPurpose.campaign_document: {
        const campaign = await this.prisma.campaign.findFirst({
          where: {
            OR: [
              { itineraryMediaId: asset.id },
              { agencyQuoteMediaId: asset.id },
            ],
            id: context.entityId,
          },
        });
        if (!campaign) throw AppException.notFound('Media asset not found.');
        if (campaign.creatorId === viewerId) {
          return;
        }
        throw AppException.forbidden('You cannot view this media.');
      }

      default:
        throw AppException.notFound('Media asset not found.');
    }
  }

  /** Batch-resolves media ids to viewable URLs, skipping ids that aren'\''t uploaded. */
  async resolveViewUrls(mediaIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(mediaIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: uniqueIds }, status: MediaStatus.uploaded },
    });

    const urls = await Promise.all(
      assets.map(async (asset) => ({
        id: asset.id,
        url: await this.storageService.createPresignedDownloadUrl(asset.key),
      })),
    );

    return new Map(urls.map(({ id, url }) => [id, url]));
  }
}
