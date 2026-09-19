import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateAgencySettingDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty() key!: string;

  @ApiProperty() value!: any;
}
