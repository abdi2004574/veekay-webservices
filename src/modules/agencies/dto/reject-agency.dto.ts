import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RejectAgencyDto {
  @ApiProperty({
    example: 'Business license document is unclear.',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}
