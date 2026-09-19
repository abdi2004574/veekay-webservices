import { ApiProperty } from '@nestjs/swagger';

export class AgencySettingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() agencyId!: string;
  @ApiProperty() key!: string;
  @ApiProperty() value!: any;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
