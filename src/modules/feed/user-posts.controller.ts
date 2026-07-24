import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { PostsService } from './posts.service';

@ApiTags('feed')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller('users')
export class UserPostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get(':id/posts')
  @ApiOperation({ summary: "List a traveler's posts (shown on their profile)." })
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
