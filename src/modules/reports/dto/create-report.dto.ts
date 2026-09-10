import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ReportTargetType } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ example: 'uuid-of-reported-item' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ example: 'This post contains spam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
