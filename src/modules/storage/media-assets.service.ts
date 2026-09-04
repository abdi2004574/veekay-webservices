import { Injectable } from '@nestjs/common';
import { MediaPurpose, MediaStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import {
  MEDIA_PURPOSE_RULES,
  extensionForContentType,
} from './media-purpose-rules';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@Injectable()
export class MediaAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async createUploadUrl(ownerId: string, dto: CreateUploadUrlDto) {
    const rule = MEDIA_PURPOSE_RULES[dto.purpose];
    if (!rule.contentTypes.includes(dto.contentType)) {
      throw AppException.badRequest(
        `Content type "${dto.contentType}" isn't allowed for ${dto.purpose}. Allowed: ${rule.contentTypes.join(', ')}.`,
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

  async getViewUrl(viewerId: string, mediaId: string): Promise<string> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });
    if (!asset || asset.status !== MediaStatus.uploaded) {
      throw AppException.notFound('Media asset not found.');
    }
    if (
      asset.purpose === MediaPurpose.agency_document &&
      asset.ownerId !== viewerId
    ) {
      throw AppException.forbidden('You cannot view this document.');
    }
    return this.storageService.createPresignedDownloadUrl(asset.key);
  }

  /** Batch-resolves media ids to viewable URLs, skipping ids that aren't uploaded. */
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
