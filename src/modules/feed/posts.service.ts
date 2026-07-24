import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
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

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
  ) {}

  private async attachViewerContext(posts: any[], viewerId: string) {
    if (posts.length === 0) {
      return posts;
    }
    const likes = await this.prisma.postLike.findMany({
      where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
    });
    const likedPostIds = new Set(likes.map((l) => l.postId));
    return posts.map((post) => ({
      ...post,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      isLikedByMe: likedPostIds.has(post.id),
      _count: undefined,
    }));
  }

  async create(authorId: string, dto: CreatePostDto) {
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

  async findByIdOrThrow(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw AppException.notFound('Post not found.');
    }
    return post;
  }

  async update(postId: string, authorId: string, dto: UpdatePostDto) {
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

  async remove(postId: string, authorId: string) {
    const post = await this.findByIdOrThrow(postId);
    if (post.authorId !== authorId) {
      throw AppException.forbidden('You can only delete your own posts.');
    }
    await this.prisma.post.delete({ where: { id: postId } });
  }

  async like(postId: string, userId: string) {
    await this.findByIdOrThrow(postId);
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      throw AppException.conflict('You already liked this post.');
    }
    await this.prisma.postLike.create({ data: { postId, userId } });
  }

  async unlike(postId: string, userId: string) {
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (!existing) {
      throw AppException.notFound('Like not found.');
    }
    await this.prisma.postLike.delete({ where: { id: existing.id } });
  }

  async repost(postId: string, authorId: string, caption?: string) {
    await this.findByIdOrThrow(postId);
    return this.prisma.post.create({
      data: {
        authorId,
        text: caption ?? '',
        repostOfId: postId,
      },
    });
  }

  async getFeed(viewerId: string, cursor?: string, limit = 20) {
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
  ) {
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
