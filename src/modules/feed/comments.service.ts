import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const AUTHOR_SELECT = {
  select: {
    id: true,
    username: true,
    displayName: true,
    travelerProfile: { select: { photoMediaId: true } },
  },
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async attachViewerContext(comments: any[], viewerId: string) {
    if (comments.length === 0) {
      return comments;
    }
    const likes = await this.prisma.commentLike.findMany({
      where: { userId: viewerId, commentId: { in: comments.map((c) => c.id) } },
    });
    const likedCommentIds = new Set(likes.map((l) => l.commentId));
    return comments.map((comment) => ({
      ...comment,
      likesCount: comment._count.likes,
      isLikedByMe: likedCommentIds.has(comment.id),
      _count: undefined,
    }));
  }

  async create(postId: string, authorId: string, dto: CreateCommentDto) {
    const post = await this.postsService.findByIdOrThrow(postId);
    const comment = await this.prisma.comment.create({
      data: { postId, authorId, text: dto.text },
    });

    if (post.authorId !== authorId) {
      try {
        await this.notificationsService.create(post.authorId, {
          type: NotificationType.comment,
          title: 'New Comment',
          body: 'Someone commented on your post.',
          deepLinkTarget: 'post',
          deepLinkEntityId: postId,
        });
      } catch (error) {
        // Log error but don't fail the comment creation
      }
    }

    return comment;
  }

  async findByIdOrThrow(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw AppException.notFound('Comment not found.');
    }
    return comment;
  }

  async update(commentId: string, authorId: string, dto: UpdateCommentDto) {
    const comment = await this.findByIdOrThrow(commentId);
    if (comment.authorId !== authorId) {
      throw AppException.forbidden('You can only edit your own comments.');
    }
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { text: dto.text },
    });
  }

  async remove(commentId: string, authorId: string) {
    const comment = await this.findByIdOrThrow(commentId);
    if (comment.authorId !== authorId) {
      throw AppException.forbidden('You can only delete your own comments.');
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  async like(commentId: string, userId: string) {
    const comment = await this.findByIdOrThrow(commentId);
    const existing = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    if (existing) {
      throw AppException.conflict('You already liked this comment.');
    }
    await this.prisma.commentLike.create({ data: { commentId, userId } });

    if (comment.authorId !== userId) {
      try {
        await this.notificationsService.create(comment.authorId, {
          type: NotificationType.like,
          title: 'New Like',
          body: 'Someone liked your comment.',
          deepLinkTarget: 'post',
          deepLinkEntityId: comment.postId,
        });
      } catch (error) {
        // Log error but don't fail the like operation
      }
    }
  }

  async unlike(commentId: string, userId: string) {
    const existing = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    if (!existing) {
      throw AppException.notFound('Like not found.');
    }
    await this.prisma.commentLike.delete({ where: { id: existing.id } });
  }

  async list(postId: string, viewerId: string, cursor?: string, limit = 20) {
    await this.postsService.findByIdOrThrow(postId);
    const comments = await this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: AUTHOR_SELECT,
        _count: { select: { likes: true } },
      },
    });

    const hasMore = comments.length > limit;
    const page = hasMore ? comments.slice(0, limit) : comments;
    const items = await this.attachViewerContext(page, viewerId);

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
