import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import {
  AuthRateLimit,
  OtpResendRateLimit,
} from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { RegisterEmailDto } from './dto/register-email.dto';
import { AgencyRegisterDto } from './dto/agency-register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { toAuthResponse } from './auth-response.mapper';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @AuthRateLimit()
  @Post('register/email')
  @ApiOperation({ summary: 'Register a traveler with email + password.' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  async registerEmail(@Body() dto: RegisterEmailDto) {
    return this.authService.registerTraveler(dto);
  }

  @Public()
  @AuthRateLimit()
  @Post('agency/register')
  @ApiOperation({ summary: 'Register an agency with email + password.' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  async registerAgency(@Body() dto: AgencyRegisterDto) {
    return this.authService.registerAgency(dto);
  }

  @Public()
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify a registration OTP and receive tokens.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code.' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const { user, tokens } = await this.authService.verifyEmail(dto);
    return toAuthResponse(user, tokens);
  }

  @Public()
  @OtpResendRateLimit()
  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend or request an OTP code.' })
  @ApiResponse({ status: 429, description: 'Rate limited.' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @ApiOperation({ summary: 'Log in with password or OTP (traveler/agency).' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(@Body() dto: LoginDto) {
    const { user, tokens } = await this.authService.login(dto);
    return toAuthResponse(user, tokens);
  }

  @Public()
  @AuthRateLimit()
  @Post('agency/login')
  @ApiOperation({ summary: 'Log in as an agency with password or OTP.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async agencyLogin(@Body() dto: LoginDto) {
    const { user, tokens } = await this.authService.login(dto, UserRole.agency);
    return toAuthResponse(user, tokens);
  }

  @Public()
  @AuthRateLimit()
  @Post('social')
  @ApiOperation({ summary: 'Traveler login via Google or Apple ID token.' })
  async social(@Body() dto: SocialLoginDto) {
    const { user, tokens } = await this.authService.socialLogin(dto);
    return toAuthResponse(user, tokens);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair.' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token.',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out of the current device.' })
  async logout(
    @Body() dto: LogoutDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const accessToken = req.headers.authorization?.split(' ')[1] ?? '';
    await this.authService.logout(user.jti, accessToken, dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out of all devices.' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const accessToken = req.headers.authorization?.split(' ')[1] ?? '';
    await this.authService.logoutAll(user.userId, user.jti, accessToken);
  }

  @Public()
  @AuthRateLimit()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset code.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @AuthRateLimit()
  @Post('agency/forgot-password')
  @ApiOperation({ summary: 'Request a password reset code (agency).' })
  async agencyForgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using an OTP code.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @ApiOperation({ summary: 'Change password (re-enter current password).' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect.' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({
    summary: 'List active sessions (devices) for the current user.',
  })
  async sessions(@CurrentUser('userId') userId: string) {
    return this.authService.getSessions(userId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific session by refresh-token id.' })
  async revokeSession(
    @Param('tokenId') tokenId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.authService.revokeSession(userId, tokenId);
  }
}
