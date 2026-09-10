import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCampaignFlagDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
