import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let prisma: any;
  let postsService: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      comment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      commentLike: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    postsService = { findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'post-1' }) };
    service = new CommentsService(prisma, postsService);
  });

  describe('create', () => {
    it('rejects commenting on a post that does not exist', async () => {
      postsService.findByIdOrThrow.mockRejectedValue(new Error('not found'));

      await expect(
        service.create('post-1', 'user-1', { text: 'nice!' }),
      ).rejects.toThrow();
    });

    it('creates a comment', async () => {
      prisma.comment.create.mockResolvedValue({ id: 'comment-1' });

      await service.create('post-1', 'user-1', { text: 'nice!' });

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', authorId: 'user-1', text: 'nice!' },
      });
    });
  });

  describe('update / remove', () => {
    it('rejects editing a comment you do not own', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', authorId: 'user-2' });

      await expect(
        service.update('comment-1', 'user-1', { text: 'edited' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects deleting a comment you do not own', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', authorId: 'user-2' });

      await expect(service.remove('comment-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('updates a comment you own', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', authorId: 'user-1' });
      prisma.comment.update.mockResolvedValue({ id: 'comment-1', text: 'edited' });

      await service.update('comment-1', 'user-1', { text: 'edited' });

      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: { text: 'edited' },
      });
    });
  });

  describe('like / unlike', () => {
    it('rejects liking a comment twice', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1' });
      prisma.commentLike.findUnique.mockResolvedValue({ id: 'like-1' });

      await expect(service.like('comment-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects unliking a comment you never liked', async () => {
      prisma.commentLike.findUnique.mockResolvedValue(null);

      await expect(service.unlike('comment-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('list', () => {
    it('flags comments liked by the viewer', async () => {
      prisma.comment.findMany.mockResolvedValue([
        { id: 'comment-1', _count: { likes: 3 } },
      ]);
      prisma.commentLike.findMany.mockResolvedValue([{ commentId: 'comment-1' }]);

      const result = await service.list('post-1', 'user-1');

      expect(result.items[0].isLikedByMe).toBe(true);
      expect(result.items[0].likesCount).toBe(3);
    });
  });
});
