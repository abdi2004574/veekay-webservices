import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SendFriendRequestDto {
  @ApiProperty({
    description: 'User id of the traveler to send a friend request to.',
  })
  @IsUUID()
  addresseeId: string;
}
