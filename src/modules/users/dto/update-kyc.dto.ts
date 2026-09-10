import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateKycDto {
  @ApiPropertyOptional({ example: 'media-id-here' })
  @IsOptional()
  @IsString()
  governmentIdMediaId?: string;

  @ApiPropertyOptional({ example: '1995-06-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isAdult?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  requiresAccompaniment?: boolean;
}
