import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ManualDonateDto {
  @ApiProperty({ minimum: 0.01, maximum: 100000, example: 25 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({ default: 'USD', pattern: '^[A-Z]{3}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string = 'USD';

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  donorDisplayName?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isGift?: boolean;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  giftMessage?: string;
}
