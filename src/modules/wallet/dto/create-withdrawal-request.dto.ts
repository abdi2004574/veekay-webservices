import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateWithdrawalRequestDto {
  @ApiProperty({ minimum: 0.01, example: 50 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ default: 'USD', minLength: 3, maxLength: 3 })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  campaignId?: string;
}