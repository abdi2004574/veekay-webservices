import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const BACKGROUND_COLORS = [
  '#D701A8',
  '#7700C6',
  '#FF6B6B',
  '#40C9C0',
  '#4A90D9',
  '#FA8072',
  '#98D8AA',
  '#F5D547',
  '#000000',
];

export class CreateStoryDto {
  @ApiProperty({
    required: false,
    description: 'Media asset id from a prior presigned upload.',
  })
  @IsOptional()
  @IsString()
  imageMediaId?: string;

  @ApiProperty({ required: false, maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  text?: string;

  @ApiProperty({ required: false, enum: BACKGROUND_COLORS })
  @IsOptional()
  @IsIn(BACKGROUND_COLORS)
  backgroundColor?: string;

  @ApiProperty({ required: false, enum: ['small', 'medium', 'large'] })
  @IsOptional()
  @IsIn(['small', 'medium', 'large'])
  textSize?: 'small' | 'medium' | 'large';
}
