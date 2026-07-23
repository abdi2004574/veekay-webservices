import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SocialProvider } from '@prisma/client';

export class SocialLoginDto {
  @ApiProperty({ enum: SocialProvider, example: SocialProvider.google })
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @ApiProperty({ description: 'Provider ID token, verified server-side.' })
  @IsString()
  idToken: string;

  @ApiProperty({ example: 'device-uuid-1234', required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ example: "Jane's iPhone", required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
