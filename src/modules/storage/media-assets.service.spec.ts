import { MediaPurpose, MediaStatus } from '@prisma/client';
import { MediaAssetsService } from './media-assets.service';

describe('MediaAssetsService', () => {
  let prisma: any;
  let storageService: any;
  let service: MediaAssetsService;

  beforeEach(() => {
    prisma = {
      mediaAsset: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
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
    service = new MediaAssetsService(prisma, storageService);
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

    it('rejects confirming someone else’s upload', async () => {
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
    it('throws not-found for an asset that is not uploaded', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        status: MediaStatus.pending,
      });

      await expect(
        service.getViewUrl('user-1', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects a non-owner viewing an agency document', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        status: MediaStatus.uploaded,
        purpose: MediaPurpose.agency_document,
        ownerId: 'agency-1',
        key: 'agency_document/agency-1/media-1.pdf',
      });

      await expect(
        service.getViewUrl('user-2', 'media-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('allows anyone to view an uploaded post photo', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        status: MediaStatus.uploaded,
        purpose: MediaPurpose.post_media,
        ownerId: 'user-1',
        key: 'post_media/user-1/media-1.jpg',
      });

      const url = await service.getViewUrl('user-2', 'media-1');

      expect(url).toEqual('https://download.example/get');
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
