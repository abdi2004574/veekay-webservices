import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AdminTwoFactorDto {
  @ApiProperty({
    description: 'Pending-2FA token issued by /admin/auth/login.',
  })
  @IsString()
  pendingToken: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code: string;
}
