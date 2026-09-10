import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateAdminInviteDto {
  @ApiProperty({ example: 'new.admin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: ['super_admin'], default: 'super_admin' })
  @IsIn(['super_admin'])
  @IsString()
  platformRole: 'super_admin';

  @ApiProperty({
    example: 'http://localhost:57800/admin/invites/accept?token=...',
  })
  @IsString()
  @Length(1, 500)
  acceptUrl: string;
}
