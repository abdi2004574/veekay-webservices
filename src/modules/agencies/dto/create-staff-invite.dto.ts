import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsIn } from 'class-validator';

export class CreateStaffInviteDto {
  @ApiProperty({ example: 'staff@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'support',
    enum: ['admin', 'support'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'support'])
  permission?: 'admin' | 'support';
}
