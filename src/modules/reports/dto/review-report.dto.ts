import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class ReviewReportDto {
  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiProperty({ required: false, example: 'Reviewed and dismissed' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}
