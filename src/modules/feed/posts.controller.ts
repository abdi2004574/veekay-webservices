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
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@ApiTags('feed')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('posts')
  @ApiOperation({ summary: 'Create a post.' })
  async create(@Body() dto: CreatePostDto, @CurrentUser('userId') userId: string) {
    return this.postsService.create(userId, dto);
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'Edit your own post.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.update(id, userId, dto);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete your own post.' })
  async remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.postsService.remove(id, userId);
  }

  @Post('posts/:id/like')
  @ApiOperation({ summary: 'Like a post.' })
  async like(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.postsService.like(id, userId);
  }

  @Delete('posts/:id/like')
  @ApiOperation({ summary: 'Unlike a post.' })
  async unlike(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.postsService.unlike(id, userId);
  }

  @Post('posts/:id/share')
  @ApiOperation({ summary: 'Repost a post to your own profile.' })
  async share(
    @Param('id') id: string,
    @Body('caption') caption: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.repost(id, userId, caption);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Chronological feed of your own and your friends’ posts.' })
  async getFeed(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.getFeed(userId, cursor, limit ? Number(limit) : undefined);
  }
}
