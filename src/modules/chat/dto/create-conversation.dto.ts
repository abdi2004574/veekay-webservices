import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const CONVERSATION_TYPES = ['direct', 'group', 'agency'];

export class CreateConversationDto {
  @ApiProperty({ enum: CONVERSATION_TYPES })
  @IsIn(CONVERSATION_TYPES)
  type: 'direct' | 'group' | 'agency';

  @ApiProperty({ required: false, description: 'Required for type=direct.' })
  @IsOptional()
  @IsString()
  participantId?: string;

  @ApiProperty({ required: false, description: 'Required for type=agency.' })
  @IsOptional()
  @IsString()
  agencyId?: string;

  @ApiProperty({ required: false, description: 'Required for type=group.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Required for type=group — friend user ids to add besides yourself.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  participantIds?: string[];
}
