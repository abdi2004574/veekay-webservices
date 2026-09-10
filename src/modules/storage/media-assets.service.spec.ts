import {
  MediaPurpose,
  MediaStatus,
  ProfileVisibility,
  AgencyStatus,
  PackageStatus,
  CampaignPrivacy,
} from '@prisma/client';
import { MediaAssetsService } from './media-assets.service';

describe('MediaAssetsService', () => {
  let prisma: any;
  let storageService: any;
  let friendsService: any;
  let service: MediaAssetsService;

  beforeEach(() => {
    prisma = {
      mediaAsset: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      agencyDocument: { findFirst: jest.fn() },
      campaignPhoto: { findFirst: jest.fn() },
      packageMedia: { findFirst: jest.fn() },
      post: { findFirst: jest.fn() },
      story: { findFirst: jest.fn() },
      message: { findFirst: jest.fn() },
      conversationParticipant: { findFirst: jest.fn() },
      agencyStaff: { findFirst: jest.fn() },
      travelerProfile: { findFirst: jest.fn() },
      travelerPreviousTripPhoto: { findFirst: jest.fn() },
      agency: { findFirst: jest.fn() },
      campaign: { findFirst: jest.fn(), findUnique: jest.fn() },
      package: { findUnique: jest.fn() },
      conversation: { findUnique: jest.fn() },
    };
    storageService = {
      createPresignedUploadUrl: jest
        .fn()
        .mockResolvedValue('https://upload.example/put'),
      createPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://download.example/get'),
      objectExists: jest.fn(),
      getObjectMetadata: jest.fn(),
      deleteObject: jest.fn(),
    };
    friendsService = {
      areFriends: jest.fn().mockResolvedValue(false),
    };
    service = new MediaAssetsService(prisma, storageService, friendsService);
  });

  describe('createUploadUrl', () => {
    it('rejects a content type not allowed for the purpose', async () => {
      await expect(
        service.createUploadUrl('user-1', {
          contentType: 'application/zip',
          purpose: MediaPurpose.profile_photo,
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.mediaAsset.create).not.toHaveBeenCalled();
    });

    it('creates a pending media asset and returns a presigned upload URL', async () => {
      prisma.mediaAsset.create.mockResolvedValue({});

      const result = await service.createUploadUrl('user-1', {
        contentType: 'image/jpeg',
        purpose: MediaPurpose.post_media,
      });

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'user-1',
          purpose: MediaPurpose.post_media,
          contentType: 'image/jpeg',
          key: expect.stringMatching(/^post_media\/user-1\/.+\.jpg$/),
        }),
      });
      expect(result.uploadUrl).toEqual('https://upload.example/put');
      expect(result.mediaId).toBeDefined();
    });
  });

  describe('confirmUpload', () => {
    const pendingAsset = {
      id: 'media-1',
      ownerId: 'user-1',
      purpose: MediaPurpose.post_media,
      key: 'post_media/user-1/media-1.jpg',
      status: MediaStatus.pending,
    };

    it('throws not-found for a missing asset', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmUpload('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it("rejects confirming someone else's upload", async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...pendingAsset,
        ownerId: 'user-2',
      });

      await expect(
        service.confirmUpload('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects confirming an already-confirmed upload', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...pendingAsset,
        status: MediaStatus.uploaded,
      });

      await expect(
        service.confirmUpload('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects confirming when the object was never actually uploaded', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(pendingAsset);
      storageService.getObjectMetadata.mockResolvedValue(null);

      await expect(
        service.confirmUpload('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('deletes and rejects a content-type mismatch', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(pendingAsset);
      storageService.getObjectMetadata.mockResolvedValue({
        size: 1024,
        contentType: 'application/pdf',
        lastModified: new Date(),
      });
      prisma.mediaAsset.update.mockResolvedValue({});

      await expect(
        service.confirmUpload('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        pendingAsset.key,
      );
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { status: MediaStatus.deleted },
      });
    });

    it('deletes and rejects an oversized upload', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(pendingAsset);
      storageService.getObjectMetadata.mockResolvedValue({
        size: 999 * 1024 * 1024,
        contentType: 'image/jpeg',
        lastModified: new Date(),
      });
      prisma.mediaAsset.update.mockResolvedValue({});

      await expect(
        service.confirmUpload('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        pendingAsset.key,
      );
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { status: MediaStatus.deleted },
      });
    });

    it('marks a valid upload as uploaded with its size', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(pendingAsset);
      storageService.getObjectMetadata.mockResolvedValue({
        size: 1024,
        contentType: 'image/jpeg',
        lastModified: new Date(),
      });
      prisma.mediaAsset.update.mockResolvedValue({
        status: MediaStatus.uploaded,
      });

      await service.confirmUpload('user-1', 'media-1');

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { status: MediaStatus.uploaded, sizeBytes: 1024 },
      });
    });
  });

  describe('getViewUrl', () => {
    const uploadedAsset = (overrides: any = {}) => ({
      id: 'media-1',
      status: MediaStatus.uploaded,
      ownerId: 'owner-1',
      key: 'test/media-1.jpg',
      purpose: MediaPurpose.post_media,
      ...overrides,
    });

    it('throws not-found for an asset that is not uploaded', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        id: 'media-1',
        status: MediaStatus.pending,
      });

      await expect(
        service.getViewUrl('user-1', 'media-1', {
          entityType: 'post',
          entityId: 'post-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('agency_document: non-owner denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({
          purpose: MediaPurpose.agency_document,
          ownerId: 'agency-owner',
        }),
      );
      prisma.agencyDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        mediaId: 'media-1',
        agencyId: 'agency-1',
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'agency',
          entityId: 'agency-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.agencyDocument.findFirst).toHaveBeenCalledWith({
        where: { mediaId: 'media-1', agencyId: 'agency-1' },
      });
    });

    it('campaign_photo: private campaign, non-creator denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.campaign_photo }),
      );
      prisma.campaignPhoto.findFirst.mockResolvedValue({
        id: 'photo-1',
        mediaId: 'media-1',
        campaignId: 'campaign-1',
      });
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'campaign-1',
        creatorId: 'creator-1',
        privacy: CampaignPrivacy.private,
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'campaign',
          entityId: 'campaign-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('campaign_photo: public campaign, anyone can view', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.campaign_photo }),
      );
      prisma.campaignPhoto.findFirst.mockResolvedValue({
        id: 'photo-1',
        mediaId: 'media-1',
        campaignId: 'campaign-1',
      });
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'campaign-1',
        creatorId: 'creator-1',
        privacy: CampaignPrivacy.public,
      });

      const url = await service.getViewUrl('user-2', 'media-1', {
        entityType: 'campaign',
        entityId: 'campaign-1',
      });

      expect(url).toEqual('https://download.example/get');
    });

    it('package_visual: inactive package, non-owner denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.package_visual }),
      );
      prisma.packageMedia.findFirst.mockResolvedValue({
        id: 'pm-1',
        mediaId: 'media-1',
        packageId: 'pkg-1',
      });
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        status: PackageStatus.inactive,
        agency: { userId: 'agency-owner' },
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'package',
          entityId: 'pkg-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('package_visual: active package but unapproved agency, non-owner denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.package_visual }),
      );
      prisma.packageMedia.findFirst.mockResolvedValue({
        id: 'pm-1',
        mediaId: 'media-1',
        packageId: 'pkg-1',
      });
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        status: PackageStatus.active,
        agency: {
          userId: 'agency-owner',
          status: AgencyStatus.pending_verification,
        },
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'package',
          entityId: 'pkg-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('post_media: non-friend denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.post_media }),
      );
      prisma.post.findFirst.mockResolvedValue({
        id: 'post-1',
        imageMediaId: 'media-1',
        authorId: 'author-1',
      });
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'post',
          entityId: 'post-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(friendsService.areFriends).toHaveBeenCalledWith(
        'user-2',
        'author-1',
      );
    });

    it('story_media: non-friend denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.story_media }),
      );
      prisma.story.findFirst.mockResolvedValue({
        id: 'story-1',
        imageMediaId: 'media-1',
        authorId: 'author-1',
        expiresAt: new Date(Date.now() + 86400000),
      });
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'story',
          entityId: 'story-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('story_media: expired story denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.story_media }),
      );
      prisma.story.findFirst.mockResolvedValue({
        id: 'story-1',
        imageMediaId: 'media-1',
        authorId: 'author-1',
        expiresAt: new Date(Date.now() - 86400000),
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'story',
          entityId: 'story-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('chat_image: non-participant denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.chat_image }),
      );
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        mediaId: 'media-1',
        conversationId: 'conv-1',
        conversation: { id: 'conv-1', type: 'direct', agencyId: null },
      });
      prisma.conversationParticipant.findFirst.mockResolvedValue(null);
      prisma.agencyStaff.findFirst.mockResolvedValue(null);

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'conversation',
          entityId: 'conv-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('chat_document: non-participant denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.chat_document }),
      );
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        mediaId: 'media-1',
        conversationId: 'conv-1',
        conversation: { id: 'conv-1', type: 'direct', agencyId: null },
      });
      prisma.conversationParticipant.findFirst.mockResolvedValue(null);
      prisma.agencyStaff.findFirst.mockResolvedValue(null);

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'conversation',
          entityId: 'conv-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('profile_photo: private profile, non-self denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.profile_photo }),
      );
      prisma.travelerProfile.findFirst.mockResolvedValue({
        userId: 'profile-owner',
        photoMediaId: 'media-1',
        user: {
          privacySetting: { profileVisibility: ProfileVisibility.private },
        },
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'profile',
          entityId: 'profile-owner',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('profile_photo: friends-only profile, non-friend denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.profile_photo }),
      );
      prisma.travelerProfile.findFirst.mockResolvedValue({
        userId: 'profile-owner',
        photoMediaId: 'media-1',
        user: {
          privacySetting: { profileVisibility: ProfileVisibility.friends },
        },
      });
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'profile',
          entityId: 'profile-owner',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('profile_photo: public profile, anyone can view', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.profile_photo }),
      );
      prisma.travelerProfile.findFirst.mockResolvedValue({
        userId: 'profile-owner',
        photoMediaId: 'media-1',
        user: {
          privacySetting: { profileVisibility: ProfileVisibility.public },
        },
      });

      const url = await service.getViewUrl('user-2', 'media-1', {
        entityType: 'profile',
        entityId: 'profile-owner',
      });

      expect(url).toEqual('https://download.example/get');
    });

    it('previous_trip_photo: private profile, non-self denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.previous_trip_photo }),
      );
      prisma.travelerPreviousTripPhoto.findFirst.mockResolvedValue({
        mediaId: 'media-1',
        userId: 'trip-owner',
        travelerProfile: {
          user: {
            privacySetting: { profileVisibility: ProfileVisibility.private },
          },
        },
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'previousTripPhoto',
          entityId: 'trip-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('agency_logo: unapproved agency denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.agency_logo }),
      );
      prisma.agency.findFirst.mockResolvedValue({
        id: 'agency-1',
        logoMediaId: 'media-1',
        status: AgencyStatus.pending_verification,
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'agency',
          entityId: 'agency-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('campaign_document: non-creator denied', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        uploadedAsset({ purpose: MediaPurpose.campaign_document }),
      );
      prisma.campaign.findFirst.mockResolvedValue({
        id: 'campaign-1',
        creatorId: 'creator-1',
        itineraryMediaId: 'media-1',
      });

      await expect(
        service.getViewUrl('user-2', 'media-1', {
          entityType: 'campaign',
          entityId: 'campaign-1',
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('cleanupMediaAssets', () => {
    it('does nothing for an empty input', async () => {
      await service.cleanupMediaAssets([]);
      expect(prisma.mediaAsset.findMany).not.toHaveBeenCalled();
    });

    it('deletes S3 objects and marks assets deleted for uploaded ones', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', key: 'post_media/u1/m1.jpg', status: MediaStatus.uploaded },
        { id: 'm2', key: 'post_media/u1/m2.jpg', status: MediaStatus.uploaded },
      ]);
      prisma.mediaAsset.update.mockResolvedValue({});

      await service.cleanupMediaAssets(['m1', 'm2']);

      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'post_media/u1/m1.jpg',
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'post_media/u1/m2.jpg',
      );
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: MediaStatus.deleted },
      });
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'm2' },
        data: { status: MediaStatus.deleted },
      });
    });

    it('skips S3 delete for non-uploaded assets but still marks them deleted', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', key: 'post_media/u1/m1.jpg', status: MediaStatus.pending },
      ]);
      prisma.mediaAsset.update.mockResolvedValue({});

      await service.cleanupMediaAssets(['m1']);

      expect(storageService.deleteObject).not.toHaveBeenCalled();
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: MediaStatus.deleted },
      });
    });

    it('continues cleanup if one deleteObject throws', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', key: 'k1', status: MediaStatus.uploaded },
        { id: 'm2', key: 'k2', status: MediaStatus.uploaded },
      ]);
      prisma.mediaAsset.update.mockResolvedValue({});
      storageService.deleteObject.mockRejectedValueOnce(new Error('S3 error'));

      await service.cleanupMediaAssets(['m1', 'm2']);

      expect(prisma.mediaAsset.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveViewUrls', () => {
    it('returns an empty map for an empty input without querying the database', async () => {
      const result = await service.resolveViewUrls([]);

      expect(result.size).toBe(0);
      expect(prisma.mediaAsset.findMany).not.toHaveBeenCalled();
    });

    it('resolves only uploaded assets, deduping ids', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'media-1', key: 'post_media/user-1/media-1.jpg' },
      ]);

      const result = await service.resolveViewUrls([
        'media-1',
        'media-1',
        'media-2',
      ]);

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['media-1', 'media-2'] },
          status: MediaStatus.uploaded,
        },
      });
      expect(result.get('media-1')).toEqual('https://download.example/get');
      expect(result.has('media-2')).toBe(false);
    });
  });
});
