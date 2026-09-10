import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateGroupMemberDto {
  @ApiProperty({ description: 'Whether this member can withdraw group funds.', example: true })
  @IsBoolean()
  canWithdraw: boolean;
}
