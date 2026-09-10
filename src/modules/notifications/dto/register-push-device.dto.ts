import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength } from 'class-validator';

export class RegisterPushDeviceDto {
  @ApiProperty({ description: 'FCM registration token' })
  @IsString()
  @MaxLength(4096)
  fcmToken: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'], default: 'ios' })
  @IsEnum(['ios', 'android', 'web'] as const)
  platform: 'ios' | 'android' | 'web';
}
