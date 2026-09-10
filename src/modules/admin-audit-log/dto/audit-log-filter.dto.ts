import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AuditLogFilterDto {
  @ApiPropertyOptional({ enum: ['agency.verification.approved', 'agency.verification.rejected', 'wallet.withdrawal.reviewed', 'wallet.withdrawal.paid', 'admin.broadcast.sent', 'campaign.verification.updated', 'content_report.reviewed', 'verified_badge.assigned', 'verified_badge.revoked'] })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'agency' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetType?: string;

  @ApiPropertyOptional({ example: 'uuid-here' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ example: 'actor-uuid' })
  @IsOptional()
  @IsString()
  actorId?: string;
}
