import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Have an amazing trip!' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;
}
