import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { OtpType } from '@prisma/client';

export class ResendOtpDto {
  @ApiProperty({ example: 'traveler@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OtpType, example: OtpType.email_verify })
  @IsEnum(OtpType)
  type: OtpType;
}
