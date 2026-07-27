import { Injectable } from '@nestjs/common';
import { AgencyStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const REVIEWER_SELECT = {
  select: { id: true, username: true, displayName: true },
};

function isEditable(editableUntil: Date): boolean {
  return editableUntil.getTime() > Date.now();
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async recomputeReputation(agencyId: string): Promise<void> {
    const { _avg } = await this.prisma.agencyReview.aggregate({
      where: { agencyId },
      _avg: { rating: true },
    });
    await this.prisma.agency.update({
      where: { id: agencyId },
      data: { reputationScore: _avg.rating ?? null },
    });
  }

  async create(agencyId: string, reviewerId: string, dto: CreateReviewDto) {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency || agency.status !== AgencyStatus.approved) {
      throw AppException.notFound('Agency not found.');
    }

    const existing = await this.prisma.agencyReview.findUnique({
      where: { agencyId_reviewerId: { agencyId, reviewerId } },
    });
    if (existing) {
      throw AppException.conflict(
        'You already reviewed this agency — edit your existing review instead.',
      );
    }

    const review = await this.prisma.agencyReview.create({
      data: {
        agencyId,
        reviewerId,
        rating: dto.rating,
        body: dto.body,
        editableUntil: new Date(Date.now() + EDIT_WINDOW_MS),
      },
    });
    await this.recomputeReputation(agencyId);
    return review;
  }

  private async findOwnedOrThrow(reviewId: string, reviewerId: string) {
    const review = await this.prisma.agencyReview.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw AppException.notFound('Review not found.');
    }
    if (review.reviewerId !== reviewerId) {
      throw AppException.forbidden('You can only manage your own reviews.');
    }
    return review;
  }

  async update(reviewId: string, reviewerId: string, dto: UpdateReviewDto) {
    const review = await this.findOwnedOrThrow(reviewId, reviewerId);
    if (!isEditable(review.editableUntil)) {
      throw AppException.businessRule(
        'This review can no longer be edited — the 7-day edit window has passed.',
      );
    }

    const updated = await this.prisma.agencyReview.update({
      where: { id: reviewId },
      data: { rating: dto.rating, body: dto.body },
    });
    if (dto.rating !== undefined) {
      await this.recomputeReputation(review.agencyId);
    }
    return updated;
  }

  async remove(reviewId: string, reviewerId: string) {
    const review = await this.findOwnedOrThrow(reviewId, reviewerId);
    if (!isEditable(review.editableUntil)) {
      throw AppException.businessRule(
        'This review can no longer be deleted — the 7-day edit window has passed.',
      );
    }

    await this.prisma.agencyReview.delete({ where: { id: reviewId } });
    await this.recomputeReputation(review.agencyId);
  }

  async listForAgency(agencyId: string, cursor?: string, limit = 20) {
    const reviews = await this.prisma.agencyReview.findMany({
      where: { agencyId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { reviewer: REVIEWER_SELECT },
    });

    const hasMore = reviews.length > limit;
    const page = hasMore ? reviews.slice(0, limit) : reviews;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listMine(reviewerId: string) {
    const reviews = await this.prisma.agencyReview.findMany({
      where: { reviewerId },
      orderBy: { createdAt: 'desc' },
      include: { agency: { select: { id: true, agencyName: true, description: true } } },
    });

    return reviews.map((review) => ({
      id: review.id,
      agencyId: review.agencyId,
      agencyName: review.agency.agencyName,
      rating: review.rating,
      body: review.body,
      createdAt: review.createdAt,
      canEdit: isEditable(review.editableUntil),
      editableUntil: review.editableUntil,
    }));
  }
}
