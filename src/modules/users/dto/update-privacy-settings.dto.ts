import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ProfileVisibility } from '@prisma/client';

export class UpdatePrivacySettingsDto {
  @ApiProperty({ enum: ProfileVisibility, required: false })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  activityStatusVisible?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  readReceiptsEnabled?: boolean;
}
