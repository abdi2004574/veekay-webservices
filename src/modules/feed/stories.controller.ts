import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';

@ApiTags('feed')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Post a story (photo, or text with a background color).' })
  async create(@Body() dto: CreateStoryDto, @CurrentUser('userId') userId: string) {
    return this.storiesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active (non-expired) stories from yourself and your friends.' })
  async list(@CurrentUser('userId') userId: string) {
    return this.storiesService.listActive(userId);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Mark a story as viewed.' })
  async view(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.storiesService.view(id, userId);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like a story.' })
  async like(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.storiesService.like(id, userId);
  }
}
