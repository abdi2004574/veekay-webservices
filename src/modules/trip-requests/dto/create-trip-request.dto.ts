import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTripRequestDto {
  @ApiProperty({ description: 'UUID of the target agency (must be approved).' })
  @IsUUID()
  agencyId: string;

  @ApiProperty({ required: false, description: 'Optional UUID of a Package owned by the agency.' })
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @ApiProperty({ required: false, description: 'Optional UUID of the traveler\'s own Campaign.' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiProperty({ minLength: 1, maxLength: 2000, description: 'Initial inquiry message; auto-posted to the chat thread on creation.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;
}
