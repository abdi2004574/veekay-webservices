import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('agencies/:agencyId/reviews')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'Review an agency (one review per traveler per agency).' })
  async create(
    @Param('agencyId') agencyId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser('userId') reviewerId: string,
  ) {
    return this.reviewsService.create(agencyId, reviewerId, dto);
  }

  @Get('agencies/:agencyId/reviews')
  @ApiOperation({ summary: "List an agency's reviews, newest first." })
  async listForAgency(
    @Param('agencyId') agencyId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.reviewsService.listForAgency(agencyId, cursor, limit ? Number(limit) : undefined);
  }

  @Get('reviews/mine')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'List your own reviews across all agencies.' })
  async listMine(@CurrentUser('userId') reviewerId: string) {
    return this.reviewsService.listMine(reviewerId);
  }

  @Patch('reviews/:id')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'Edit your own review (within 7 days of submission).' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser('userId') reviewerId: string,
  ) {
    return this.reviewsService.update(id, reviewerId, dto);
  }

  @Delete('reviews/:id')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'Delete your own review (within 7 days of submission).' })
  async remove(@Param('id') id: string, @CurrentUser('userId') reviewerId: string) {
    await this.reviewsService.remove(id, reviewerId);
  }
}
