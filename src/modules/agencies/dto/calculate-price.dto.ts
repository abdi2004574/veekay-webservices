import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max } from 'class-validator';

export class CalculatePriceDto {
  @ApiProperty()
  @IsString()
  packageId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(100)
  fundraisingPercentage!: number;
}
