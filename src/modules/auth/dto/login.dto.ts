import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'traveler@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    required: false,
    description: 'Provide either password or otp, not both.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({
    example: '123456',
    required: false,
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  otp?: string;

  @ApiProperty({ example: 'device-uuid-1234', required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ example: "Jane's iPhone", required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
