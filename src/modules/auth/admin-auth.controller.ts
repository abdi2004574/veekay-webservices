import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthRateLimit } from '../../common/decorators/rate-limit.decorator';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminTwoFactorDto } from './dto/admin-two-factor.dto';
import { toAuthResponse } from './auth-response.mapper';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @AuthRateLimit()
  @Post('login')
  @ApiOperation({
    summary:
      'Step 1 of admin login — password check, returns a pending 2FA token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Public()
  @AuthRateLimit()
  @Post('2fa')
  @ApiOperation({
    summary: 'Step 2 of admin login — TOTP code, returns tokens.',
  })
  @ApiResponse({ status: 401, description: 'Invalid two-factor code.' })
  async twoFactor(@Body() dto: AdminTwoFactorDto) {
    const { user, tokens } = await this.authService.adminTwoFactor(dto);
    return toAuthResponse(user, tokens);
  }
}
