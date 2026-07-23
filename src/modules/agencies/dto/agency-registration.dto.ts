import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { AgencyDocumentDto } from './agency-document.dto';

export class AgencyRegistrationDto {
  @ApiProperty({ example: '+1 555 010 2000' })
  @IsString()
  businessContactDetails: string;

  @ApiProperty({ example: '123 Market St, San Francisco, CA' })
  @IsString()
  businessAddress: string;

  @ApiProperty({ type: [AgencyDocumentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgencyDocumentDto)
  documents: AgencyDocumentDto[];
}
