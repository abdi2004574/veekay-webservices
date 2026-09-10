import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class BroadcastNotificationDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  body: string;

  @ApiProperty({ enum: ['all', 'role', 'user'], default: 'all' })
  @IsEnum(['all', 'role', 'user'] as const)
  target: 'all' | 'role' | 'user';

  @ApiProperty({ required: false, enum: ['traveler', 'agency'] })
  @ValidateIf((o: BroadcastNotificationDto) => o.target === 'role')
  @IsEnum(['traveler', 'agency'] as const)
  role?: 'traveler' | 'agency';

  @ApiProperty({ required: false })
  @ValidateIf((o: BroadcastNotificationDto) => o.target === 'user')
  @IsString()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
