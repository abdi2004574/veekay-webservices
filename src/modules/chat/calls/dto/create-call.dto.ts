import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class CreateCallDto {
  @ApiProperty({ required: true })
  @IsString()
  conversationId: string;

  @ApiProperty({ enum: ['audio', 'video'], default: 'video' })
  @IsIn(['audio', 'video'])
  type: 'audio' | 'video';
}
