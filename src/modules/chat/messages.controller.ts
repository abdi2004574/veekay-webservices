import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@RequireRole(UserRole.traveler, UserRole.agency)
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message (text, image, or document).' })
  async send(
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messagesService.send(conversationId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List messages, newest first (also marks them delivered to you).' })
  async list(
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messagesService.list(
      conversationId,
      userId,
      cursor,
      limit ? Number(limit) : undefined,
    );
  }
}
