import { PostsService } from './posts.service';

describe('PostsService', () => {
  let prisma: any;
  let friendsService: any;
  let mediaAssetsService: any;
  let service: PostsService;

  beforeEach(() => {
    prisma = {
      post: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      postLike: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    friendsService = { getFriendIds: jest.fn().mockResolvedValue([]) };
    mediaAssetsService = {
      resolveViewUrls: jest.fn().mockResolvedValue(new Map()),
    };
    const mockNotificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };
    service = new PostsService(
      prisma,
      friendsService,
      mediaAssetsService,
      mockNotificationsService as any,
    );
  });

  describe('create', () => {
    it('creates a post with default empty tags', async () => {
      prisma.post.create.mockResolvedValue({ id: 'post-1' });

      await service.create('user-1', { text: 'hello' });

      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          authorId: 'user-1',
          text: 'hello',
          imageMediaId: undefined,
          location: undefined,
          tags: [],
        },
      });
    });
  });

  describe('update', () => {
    it('rejects editing a post you do not own', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-2',
      });

      await expect(
        service.update('post-1', 'user-1', { text: 'edited' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects editing a post that does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(
        service.update('post-1', 'user-1', { text: 'edited' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('updates a post you own', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-1',
      });
      prisma.post.update.mockResolvedValue({ id: 'post-1', text: 'edited' });

      await service.update('post-1', 'user-1', { text: 'edited' });

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: {
          text: 'edited',
          imageMediaId: undefined,
          location: undefined,
          tags: undefined,
        },
      });
    });
  });

  describe('remove', () => {
    it('rejects deleting a post you do not own', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-2',
      });

      await expect(service.remove('post-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('deletes a post you own', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        authorId: 'user-1',
      });

      await service.remove('post-1', 'user-1');

      expect(prisma.post.delete).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
    });
  });

  describe('like / unlike', () => {
    it('rejects liking a post twice', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1' });
      prisma.postLike.findUnique.mockResolvedValue({ id: 'like-1' });

      await expect(service.like('post-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('likes a post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1' });
      prisma.postLike.findUnique.mockResolvedValue(null);

      await service.like('post-1', 'user-1');

      expect(prisma.postLike.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', userId: 'user-1' },
      });
    });

    it('rejects unliking a post you never liked', async () => {
      prisma.postLike.findUnique.mockResolvedValue(null);

      await expect(service.unlike('post-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('unlikes a post', async () => {
      prisma.postLike.findUnique.mockResolvedValue({ id: 'like-1' });

      await service.unlike('post-1', 'user-1');

      expect(prisma.postLike.delete).toHaveBeenCalledWith({
        where: { id: 'like-1' },
      });
    });
  });

  describe('repost', () => {
    it('creates a new post referencing the original via repostOfId', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1' });
      prisma.post.create.mockResolvedValue({
        id: 'post-2',
        repostOfId: 'post-1',
      });

      await service.repost('post-1', 'user-2', 'check this out');

      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          authorId: 'user-2',
          text: 'check this out',
          repostOfId: 'post-1',
        },
      });
    });
  });

  describe('getFeed', () => {
    it('scopes the feed to self and friends, and flags liked-by-me posts', async () => {
      friendsService.getFriendIds.mockResolvedValue(['friend-1']);
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          authorId: 'friend-1',
          _count: { likes: 2, comments: 1 },
        },
      ]);
      prisma.postLike.findMany.mockResolvedValue([{ postId: 'post-1' }]);

      const result = await service.getFeed('user-1');

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: { in: ['user-1', 'friend-1'] } },
        }),
      );
      expect(result.items[0].isLikedByMe).toBe(true);
      expect(result.items[0].likesCount).toBe(2);
      expect(result.nextCursor).toBeNull();
    });

    it('returns a nextCursor when more results exist than the page limit', async () => {
      const posts = Array.from({ length: 21 }, (_, i) => ({
        id: `post-${i}`,
        authorId: 'user-1',
        _count: { likes: 0, comments: 0 },
      }));
      prisma.post.findMany.mockResolvedValue(posts);

      const result = await service.getFeed('user-1');

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('post-19');
    });
  });
});
