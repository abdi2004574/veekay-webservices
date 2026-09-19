import { ApiProperty } from '@nestjs/swagger';

export interface PlatformSetting {
  id: string;
  key: string;
  value: unknown;
  description?: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export class PlatformSettingsResponse {
  @ApiProperty({ type: [Object] })
  settings!: PlatformSetting[];
}
