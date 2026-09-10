import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export class DonateDto {
  @ApiProperty({ minimum: 0.5, example: 25 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  amount: number;

  @ApiProperty({ default: 'USD', minLength: 3, maxLength: 3 })
  @IsString()
  @Length(3, 3)
  currency: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  donorDisplayName?: string;
}
