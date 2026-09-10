import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class AcceptAdminInviteDto {
  @ApiProperty({ example: 'token-from-email-link' })
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  token: string;
}
