import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class AgencyRegisterDto {
  @ApiProperty({ example: 'agency@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Wanderlust Travel Co.' })
  @IsString()
  @MinLength(1)
  agencyName: string;
}
