import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsObject } from 'class-validator';

export class UpdateSettingsRequest {
  @ApiProperty({ type: Object })
  @IsObject()
  settings: Record<string, Prisma.InputJsonValue>;
}
