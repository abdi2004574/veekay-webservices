import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationChannel, NotificationType } from '@prisma/client';

export class CreateNotificationDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deepLinkTarget?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deepLinkEntityId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty({
    enum: NotificationChannel,
    required: false,
    default: 'in_app',
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}
