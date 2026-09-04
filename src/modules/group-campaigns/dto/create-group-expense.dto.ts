import { ApiProperty } from '@nestjs/swagger';
import { GroupExpenseCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateGroupExpenseDto {
  @ApiProperty({ example: 'Flight tickets' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 800 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: GroupExpenseCategory })
  @IsEnum(GroupExpenseCategory)
  category: GroupExpenseCategory;

  @ApiProperty({
    description:
      'userId of the group member who paid — must be a current member.',
  })
  @IsString()
  paidByUserId: string;

  @ApiProperty({
    required: false,
    description: 'ISO date string, defaults to now.',
  })
  @IsOptional()
  @IsDateString()
  spentAt?: string;
}
