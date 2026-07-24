import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ConfirmUploadDto {
  @ApiProperty()
  @IsUUID()
  mediaId: string;
}
