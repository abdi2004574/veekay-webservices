import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { VerifiedBadgeSubjectType } from '@prisma/client';

export class AssignBadgeDto {
  @ApiProperty({ enum: VerifiedBadgeSubjectType })
  @IsEnum(VerifiedBadgeSubjectType)
  subjectType: VerifiedBadgeSubjectType;

  @ApiProperty({ example: 'uuid-of-user-or-agency' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;
}
