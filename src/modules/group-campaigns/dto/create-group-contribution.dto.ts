import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateGroupContributionDto {
  @ApiProperty({ example: 250 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ required: false, example: 'Flight deposit' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
