import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@ApiTags('chat')
@ApiBearerAuth()
@RequireRole(UserRole.traveler, UserRole.agency)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start (or reuse) a direct, group, or agency conversation.' })
  async create(@Body() dto: CreateConversationDto, @CurrentUser('userId') userId: string) {
    return this.conversationsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List your conversations, most recently active first.' })
  async list(@CurrentUser('userId') userId: string) {
    return this.conversationsService.listForUser(userId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Total unread message count across all your conversations.' })
  async unreadCount(@CurrentUser('userId') userId: string) {
    return { count: await this.conversationsService.unreadCount(userId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Conversation detail (participants for group chats).' })
  async getById(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.conversationsService.getById(id, userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark all messages in this conversation read.' })
  async markRead(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.messagesService.markRead(id, userId);
  }

  @Post(':id/participants')
  @ApiOperation({ summary: 'Add friends to a group conversation (admin only).' })
  async addParticipants(
    @Param('id') id: string,
    @Body('userIds') userIds: string[],
    @CurrentUser('userId') userId: string,
  ) {
    await this.conversationsService.addParticipants(id, userId, userIds ?? []);
  }

  @Delete(':id/participants/:userId')
  @ApiOperation({ summary: 'Leave a group, or (admin only) remove another member.' })
  async removeParticipant(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.conversationsService.removeParticipant(id, userId, targetUserId);
  }
}
