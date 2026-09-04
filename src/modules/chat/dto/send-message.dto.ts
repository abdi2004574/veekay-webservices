import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const MESSAGE_TYPES = ['text', 'image', 'document'];

export class SendMessageDto {
  @ApiProperty({ enum: MESSAGE_TYPES, default: 'text' })
  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: 'text' | 'image' | 'document';

  @ApiProperty({ required: false, description: 'Required for type=text.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @ApiProperty({
    required: false,
    description:
      'Required for type=image/document — a confirmed media asset id (purpose chat_image/chat_document).',
  })
  @IsOptional()
  @IsString()
  mediaId?: string;

  @ApiProperty({
    required: false,
    description: 'Original filename, for type=document.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
