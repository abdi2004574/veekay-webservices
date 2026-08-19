import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AddGroupMemberDto {
  @ApiProperty({ description: 'userId of a friend to add to the group.' })
  @IsString()
  userId: string;
}
