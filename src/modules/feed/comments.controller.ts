import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('feed')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'Comment on a post.' })
  async create(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.commentsService.create(postId, userId, dto);
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'List comments on a post.' })
  async list(
    @Param('postId') postId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.commentsService.list(
      postId,
      userId,
      cursor,
      limit ? Number(limit) : undefined,
    );
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Edit your own comment.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.commentsService.update(id, userId, dto);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete your own comment.' })
  async remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.commentsService.remove(id, userId);
  }

  @Post('comments/:id/like')
  @ApiOperation({ summary: 'Like a comment.' })
  async like(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.commentsService.like(id, userId);
  }

  @Delete('comments/:id/like')
  @ApiOperation({ summary: 'Unlike a comment.' })
  async unlike(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.commentsService.unlike(id, userId);
  }
}
