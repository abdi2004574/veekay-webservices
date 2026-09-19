import { Injectable } from '@nestjs/common';
import { NotificationType, Post } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

const AUTHOR_SELECT = {
  select: {
    id: true,
    username: true,
    displayName: true,
    travelerProfile: { select: { photoMediaId: true } },
  },
};

type PostAuthorView = {
  id: string;
  username: string;
  displayName: string | null;
  travelerProfile: { photoMediaId: string | null } | null;
};

type PostWithView = Post & {
  author: PostAuthorView;
  repostOf: (Post & { author: PostAuthorView }) | null;
  _count: { likes: number; comments: number };
};

export interface PostViewModel {
  id: string;
  author: PostAuthorView;
  likesCount: number;
  commentsCount: number;
  isLikedByMe: boolean;
  imageUrl: string | null;
  repostOf: {
    id: string;
    author: PostAuthorView;
    imageUrl: string | null;
  } | null;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
    private readonly mediaAssetsService: MediaAssetsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async attachViewerContext(
    posts: PostWithView[],
    viewerId: string,
  ): Promise<PostViewModel[]> {
    if (posts.length === 0) {
      return [];
    }
    const likes = await this.prisma.postLike.findMany({
      where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
    });
    const likedPostIds = new Set(likes.map((l) => l.postId));

    const mediaIds = posts.flatMap((p) =>
      [p.imageMediaId, p.repostOf?.imageMediaId].filter(
        (id): id is string => !!id,
      ),
    );
    const urlsByMediaId =
      await this.mediaAssetsService.resolveViewUrls(mediaIds);

    return posts.map((post) => {
      const { _count, ...basePost } = post;
      return {
        id: basePost.id,
        author: basePost.author,
        likesCount: _count.likes,
        commentsCount: _count.comments,
        isLikedByMe: likedPostIds.has(basePost.id),
        imageUrl: basePost.imageMediaId
          ? (urlsByMediaId.get(basePost.imageMediaId) ?? null)
          : null,
        repostOf: basePost.repostOf
          ? {
              id: basePost.repostOf.id,
              author: basePost.repostOf.author,
              imageUrl: basePost.repostOf.imageMediaId
                ? (urlsByMediaId.get(basePost.repostOf.imageMediaId) ?? null)
                : null,
            }
          : null,
      };
    });
  }

  async create(authorId: string, dto: CreatePostDto): Promise<Post> {
    return this.prisma.post.create({
      data: {
        authorId,
        text: dto.text,
        imageMediaId: dto.imageMediaId,
        location: dto.location,
        tags: dto.tags ?? [],
      },
    });
  }

  async findByIdOrThrow(postId: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw AppException.notFound('Post not found.');
    }
    return post;
  }

  async update(
    postId: string,
    authorId: string,
    dto: UpdatePostDto,
  ): Promise<Post> {
    const post = await this.findByIdOrThrow(postId);
    if (post.authorId !== authorId) {
      throw AppException.forbidden('You can only edit your own posts.');
    }
    return this.prisma.post.update({
      where: { id: postId },
      data: {
        text: dto.text,
        imageMediaId: dto.imageMediaId,
        location: dto.location,
        tags: dto.tags,
      },
    });
  }

  async remove(postId: string, authorId: string): Promise<void> {
    const post = await this.findByIdOrThrow(postId);
    if (post.authorId !== authorId) {
      throw AppException.forbidden('You can only delete your own posts.');
    }
    await this.prisma.post.delete({ where: { id: postId } });
  }

  async like(postId: string, userId: string): Promise<void> {
    const post = await this.findByIdOrThrow(postId);
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      throw AppException.conflict('You already liked this post.');
    }
    await this.prisma.postLike.create({ data: { postId, userId } });

    if (post.authorId !== userId) {
      try {
        await this.notificationsService.create(post.authorId, {
          type: NotificationType.like,
          title: 'New Like',
          body: 'Someone liked your post.',
          deepLinkTarget: 'post',
          deepLinkEntityId: postId,
        });
      } catch (error) {
        // Log error but don't fail the like operation
      }
    }
  }

  async unlike(postId: string, userId: string): Promise<void> {
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (!existing) {
      throw AppException.notFound('Like not found.');
    }
    await this.prisma.postLike.delete({ where: { id: existing.id } });
  }

  async repost(
    postId: string,
    authorId: string,
    caption?: string,
  ): Promise<Post> {
    const originalPost = await this.findByIdOrThrow(postId);
    const newPost = await this.prisma.post.create({
      data: {
        authorId,
        text: caption ?? '',
        repostOfId: postId,
      },
    });

    if (originalPost.authorId !== authorId) {
      try {
        await this.notificationsService.create(originalPost.authorId, {
          type: NotificationType.share,
          title: 'Post Shared',
          body: 'Someone shared your post.',
          deepLinkTarget: 'post',
          deepLinkEntityId: newPost.id,
        });
      } catch (error) {
        // Log error but don't fail the repost operation
      }
    }

    return newPost;
  }

  async getFeed(
    viewerId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: PostViewModel[]; nextCursor: string | null }> {
    const friendIds = await this.friendsService.getFriendIds(viewerId);
    const authorIds = [viewerId, ...friendIds];

    const posts = await this.prisma.post.findMany({
      where: { authorId: { in: authorIds } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: AUTHOR_SELECT,
        repostOf: { include: { author: AUTHOR_SELECT } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    const items = await this.attachViewerContext(page, viewerId);

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listByAuthor(
    authorId: string,
    viewerId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: PostViewModel[]; nextCursor: string | null }> {
    const posts = await this.prisma.post.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: AUTHOR_SELECT,
        repostOf: { include: { author: AUTHOR_SELECT } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    const items = await this.attachViewerContext(page, viewerId);

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
