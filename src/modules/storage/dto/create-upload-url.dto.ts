import { ApiProperty } from '@nestjs/swagger';
import { MediaPurpose } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateUploadUrlDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  contentType: string;

  @ApiProperty({ enum: MediaPurpose, example: MediaPurpose.post_media })
  @IsEnum(MediaPurpose)
  purpose: MediaPurpose;
}
