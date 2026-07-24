import { StoriesService } from './stories.service';

describe('StoriesService', () => {
  let prisma: any;
  let friendsService: any;
  let mediaAssetsService: any;
  let service: StoriesService;

  beforeEach(() => {
    prisma = {
      story: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      storyView: { findUnique: jest.fn(), create: jest.fn() },
      storyLike: { findUnique: jest.fn(), create: jest.fn() },
    };
    friendsService = { getFriendIds: jest.fn().mockResolvedValue([]) };
    mediaAssetsService = { resolveViewUrls: jest.fn().mockResolvedValue(new Map()) };
    service = new StoriesService(prisma, friendsService, mediaAssetsService);
  });

  describe('create', () => {
    it('rejects a story with neither image nor text', async () => {
      await expect(service.create('user-1', {})).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('creates a photo story with a 24h expiry', async () => {
      prisma.story.create.mockResolvedValue({ id: 'story-1' });

      await service.create('user-1', { imageMediaId: 'media-1' });

      const args = prisma.story.create.mock.calls[0][0];
      expect(args.data.authorId).toBe('user-1');
      expect(args.data.imageMediaId).toBe('media-1');
      const ttlMs = args.data.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('creates a text-only story with a background color', async () => {
      prisma.story.create.mockResolvedValue({ id: 'story-1' });

      await service.create('user-1', {
        text: 'Loving this trip!',
        backgroundColor: '#D701A8',
        textSize: 'medium',
      });

      expect(prisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            text: 'Loving this trip!',
            backgroundColor: '#D701A8',
            textSize: 'medium',
          }),
        }),
      );
    });
  });

  describe('findActiveByIdOrThrow', () => {
    it('rejects an expired story', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.findActiveByIdOrThrow('story-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns an active story', async () => {
      const story = { id: 'story-1', expiresAt: new Date(Date.now() + 1000) };
      prisma.story.findUnique.mockResolvedValue(story);

      await expect(service.findActiveByIdOrThrow('story-1')).resolves.toEqual(story);
    });
  });

  describe('listActive', () => {
    it('scopes active stories to self and friends', async () => {
      friendsService.getFriendIds.mockResolvedValue(['friend-1']);
      prisma.story.findMany.mockResolvedValue([]);

      await service.listActive('user-1');

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            authorId: { in: ['user-1', 'friend-1'] },
          }),
        }),
      );
    });
  });

  describe('view', () => {
    it('does not duplicate a view from the same viewer', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        expiresAt: new Date(Date.now() + 1000),
      });
      prisma.storyView.findUnique.mockResolvedValue({ id: 'view-1' });

      await service.view('story-1', 'user-1');

      expect(prisma.storyView.create).not.toHaveBeenCalled();
    });

    it('records a new view', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        expiresAt: new Date(Date.now() + 1000),
      });
      prisma.storyView.findUnique.mockResolvedValue(null);

      await service.view('story-1', 'user-1');

      expect(prisma.storyView.create).toHaveBeenCalledWith({
        data: { storyId: 'story-1', viewerId: 'user-1' },
      });
    });
  });

  describe('like', () => {
    it('rejects liking a story twice', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        expiresAt: new Date(Date.now() + 1000),
      });
      prisma.storyLike.findUnique.mockResolvedValue({ id: 'like-1' });

      await expect(service.like('story-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });
});
