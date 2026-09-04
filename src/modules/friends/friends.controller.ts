import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { FriendsService } from './friends.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';

@ApiTags('friends')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller()
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('friend-requests')
  @ApiOperation({ summary: 'Send a friend request to another traveler.' })
  async sendRequest(
    @Body() dto: SendFriendRequestDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.friendsService.sendRequest(userId, dto.addresseeId);
  }

  @Post('friend-requests/:id/accept')
  @ApiOperation({ summary: 'Accept an incoming friend request.' })
  async accept(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.friendsService.accept(id, userId);
  }

  @Post('friend-requests/:id/decline')
  @ApiOperation({ summary: 'Decline an incoming friend request.' })
  async decline(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.friendsService.decline(id, userId);
  }

  @Get('friend-requests')
  @ApiOperation({ summary: 'List incoming (pending) friend requests.' })
  async listIncoming(@CurrentUser('userId') userId: string) {
    return this.friendsService.listIncoming(userId);
  }

  @Get('friends')
  @ApiOperation({ summary: "List the current user's friends." })
  async listFriends(@CurrentUser('userId') userId: string) {
    return this.friendsService.listFriends(userId);
  }

  @Delete('friends/:userId')
  @ApiOperation({ summary: 'Remove a friend.' })
  async unfriend(
    @Param('userId') otherUserId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.friendsService.unfriend(userId, otherUserId);
  }
}
