import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { AgencyDocumentType } from '@prisma/client';

export class AgencyDocumentDto {
  @ApiProperty({
    enum: AgencyDocumentType,
    example: AgencyDocumentType.business_license,
  })
  @IsEnum(AgencyDocumentType)
  type: AgencyDocumentType;

  @ApiProperty({ description: 'Media asset id from a prior presigned upload.' })
  @IsString()
  mediaId: string;
}
