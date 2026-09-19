import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PostsService } from './posts.service';

@ApiTags('feed')
@ApiBearerAuth()
@Controller('users')
export class UserPostsController {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Get(':id/posts')
  @ApiOperation({
    summary: "List a traveler's posts (shown on their profile).",
  })
  async listByAuthor(
    @Param('id') id: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.listByAuthor(
      id,
      userId,
      cursor,
      limit ? Number(limit) : undefined,
    );
  }
}
