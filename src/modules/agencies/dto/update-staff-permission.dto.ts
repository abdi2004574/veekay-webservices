import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class UpdateStaffPermissionDto {
  @ApiProperty({ example: 'admin', enum: ['owner', 'admin', 'support'] })
  @IsString()
  @IsIn(['owner', 'admin', 'support'])
  permission: 'owner' | 'admin' | 'support';
}
