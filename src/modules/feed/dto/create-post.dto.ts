import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'Just landed in Bali!' })
  @IsString()
  @MinLength(1)
  @MaxLength(2200)
  text: string;

  @ApiProperty({
    required: false,
    description: 'Media asset id from a prior presigned upload.',
  })
  @IsOptional()
  @IsString()
  imageMediaId?: string;

  @ApiProperty({ required: false, example: 'Bali, Indonesia' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}
