import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { CreateStoryDto } from './dto/create-story.dto';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const AUTHOR_SELECT = {
  select: {
    id: true,
    username: true,
    displayName: true,
    travelerProfile: { select: { photoMediaId: true } },
  },
};

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
    private readonly mediaAssetsService: MediaAssetsService,
  ) {}

  async create(authorId: string, dto: CreateStoryDto) {
    if (!dto.imageMediaId && !dto.text) {
      throw AppException.badRequest(
        'A story needs either a photo or text content.',
      );
    }
    return this.prisma.story.create({
      data: {
        authorId,
        imageMediaId: dto.imageMediaId,
        text: dto.text,
        backgroundColor: dto.backgroundColor,
        textSize: dto.textSize,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      },
    });
  }

  async findActiveByIdOrThrow(storyId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story || story.expiresAt < new Date()) {
      throw AppException.notFound('Story not found or has expired.');
    }
    return story;
  }

  async listActive(viewerId: string) {
    const friendIds = await this.friendsService.getFriendIds(viewerId);
    const authorIds = [viewerId, ...friendIds];

    const stories = await this.prisma.story.findMany({
      where: { authorId: { in: authorIds }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: {
        author: AUTHOR_SELECT,
        _count: { select: { likes: true, views: true } },
      },
    });

    const mediaIds = stories
      .map((s) => s.imageMediaId)
      .filter((id): id is string => !!id);
    const urlsByMediaId =
      await this.mediaAssetsService.resolveViewUrls(mediaIds);

    return stories.map((story) => ({
      ...story,
      imageUrl: story.imageMediaId
        ? (urlsByMediaId.get(story.imageMediaId) ?? null)
        : null,
    }));
  }

  async view(storyId: string, viewerId: string) {
    await this.findActiveByIdOrThrow(storyId);
    const existing = await this.prisma.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId } },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.storyView.create({ data: { storyId, viewerId } });
  }

  async like(storyId: string, userId: string) {
    await this.findActiveByIdOrThrow(storyId);
    const existing = await this.prisma.storyLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });
    if (existing) {
      throw AppException.conflict('You already liked this story.');
    }
    await this.prisma.storyLike.create({ data: { storyId, userId } });
  }
}
