import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpType, PlatformRole, User, UserRole } from '@prisma/client';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PasswordService } from './password.service';
import { OtpService } from './otp.service';
import { TokenService, TokenPair } from './token.service';
import { SocialAuthService } from './social-auth.service';
import { TwoFactorService } from './two-factor.service';
import { RegisterEmailDto } from './dto/register-email.dto';
import { AgencyRegisterDto } from './dto/agency-register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminTwoFactorDto } from './dto/admin-two-factor.dto';
import { loginAttemptsKey, loginLockKey } from './auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly socialAuthService: SocialAuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private async generateUsername(seed: string): Promise<string> {
    const base =
      seed
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20) || 'user';

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate =
        attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw AppException.businessRule('Could not generate a unique username, please try again.');
  }

  private async createUnverifiedUser(
    email: string,
    password: string,
    role: UserRole,
    displayName?: string,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw AppException.conflict('An account with this email already exists.');
    }

    const passwordHash = await this.passwordService.hash(password);
    const username = await this.generateUsername(displayName ?? email.split('@')[0]);
    return this.prisma.user.create({
      data: { email, username, passwordHash, role, displayName },
    });
  }

  private async sendEmailVerificationOtp(email: string): Promise<void> {
    const code = await this.otpService.issue(email, OtpType.email_verify);
    await this.mailService.sendOtpEmail(email, code, 'verify');
  }

  async registerTraveler(dto: RegisterEmailDto) {
    const user = await this.createUnverifiedUser(
      dto.email,
      dto.password,
      UserRole.traveler,
      dto.displayName,
    );
    await this.sendEmailVerificationOtp(user.email);
    return {
      userId: user.id,
      message: 'Check your email for a verification code.',
    };
  }

  async registerAgency(dto: AgencyRegisterDto) {
    const user = await this.createUnverifiedUser(
      dto.email,
      dto.password,
      UserRole.agency,
      dto.agencyName,
    );
    await this.sendEmailVerificationOtp(user.email);
    return {
      userId: user.id,
      message: 'Check your email for a verification code.',
    };
  }

  async verifyEmail(
    dto: VerifyEmailDto,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw AppException.badRequest('Invalid or expired code.');
    }

    await this.otpService.verify(user.email, OtpType.email_verify, dto.otp);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issueTokenPair(updated);
    return { user: updated, tokens };
  }

  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      const code = await this.otpService.issue(dto.email, dto.type);
      if (dto.type === OtpType.password_reset) {
        await this.mailService.sendOtpEmail(dto.email, code, 'reset');
      } else {
        await this.mailService.sendOtpEmail(dto.email, code, 'verify');
      }
    }

    return { message: 'If an account exists, a code has been sent.' };
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw AppException.unauthorized('Invalid email or password.');
    }

    const isValid = await this.passwordService.verify(
      password,
      user.passwordHash,
    );
    if (!isValid) {
      throw AppException.unauthorized('Invalid email or password.');
    }

    return user;
  }

  private async assertNotLockedOut(identifier: string): Promise<void> {
    const locked = await this.redis.get(loginLockKey(identifier));
    if (locked) {
      throw AppException.unauthorized(
        'Too many failed attempts. Try again later.',
      );
    }
  }

  private async registerFailedLoginAttempt(identifier: string): Promise<void> {
    const attemptsKey = loginAttemptsKey(identifier);
    const attempts = await this.redis.incr(attemptsKey);
    await this.redis.expire(attemptsKey, 15 * 60);

    const threshold = this.config.get('login.lockoutThreshold', {
      infer: true,
    });
    if (attempts >= threshold) {
      const lockoutMinutes = this.config.get('login.lockoutMinutes', {
        infer: true,
      });
      await this.redis.set(
        loginLockKey(identifier),
        '1',
        'EX',
        lockoutMinutes * 60,
      );
    }
  }

  private async clearLoginAttempts(identifier: string): Promise<void> {
    await this.redis.del(
      loginAttemptsKey(identifier),
      loginLockKey(identifier),
    );
  }

  async login(
    dto: LoginDto,
    expectedRole?: typeof UserRole.traveler | typeof UserRole.agency,
  ): Promise<{ user: User; tokens: TokenPair }> {
    await this.assertNotLockedOut(dto.email);

    let user: User;

    if (dto.password) {
      try {
        user = await this.validateCredentials(dto.email, dto.password);
      } catch (error) {
        await this.registerFailedLoginAttempt(dto.email);
        throw error;
      }
      await this.clearLoginAttempts(dto.email);
    } else if (dto.otp) {
      const found = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (!found) {
        throw AppException.unauthorized('Invalid or expired code.');
      }
      await this.otpService.verify(dto.email, OtpType.login, dto.otp);
      user = found;
    } else {
      throw AppException.badRequest('Provide either a password or a code.');
    }

    if (user.role === UserRole.admin) {
      throw AppException.forbidden('Use the admin login endpoint.');
    }

    if (expectedRole && user.role !== expectedRole) {
      throw AppException.unauthorized('Invalid email or password.');
    }

    if (!user.isActive) {
      throw AppException.forbidden('This account has been deactivated.');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issueTokenPair(updated, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
    });

    return { user: updated, tokens };
  }

  async socialLogin(
    dto: SocialLoginDto,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const profile =
      dto.provider === 'google'
        ? await this.socialAuthService.verifyGoogleIdToken(dto.idToken)
        : await this.socialAuthService.verifyAppleIdToken(dto.idToken);

    const existingIdentity = await this.prisma.socialIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: dto.provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: true },
    });

    let user: User;

    if (existingIdentity) {
      user = existingIdentity.user;
    } else {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingUser) {
        if (existingUser.role !== UserRole.traveler) {
          throw AppException.forbidden(
            'Social login is only available for traveler accounts.',
          );
        }
        await this.prisma.socialIdentity.create({
          data: {
            userId: existingUser.id,
            provider: dto.provider,
            providerUserId: profile.providerUserId,
          },
        });
        user = existingUser.isEmailVerified
          ? existingUser
          : await this.prisma.user.update({
              where: { id: existingUser.id },
              data: { isEmailVerified: true },
            });
      } else {
        const username = await this.generateUsername(profile.email.split('@')[0]);
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            username,
            role: UserRole.traveler,
            isEmailVerified: true,
          },
        });
        await this.prisma.socialIdentity.create({
          data: {
            userId: user.id,
            provider: dto.provider,
            providerUserId: profile.providerUserId,
          },
        });
      }
    }

    if (!user.isActive) {
      throw AppException.forbidden('This account has been deactivated.');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issueTokenPair(updated, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
    });

    return { user: updated, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const { tokens } = await this.tokenService.rotateRefreshToken(refreshToken);
    return tokens;
  }

  async logout(
    accessTokenJti: string,
    accessToken: string,
    refreshToken: string,
  ) {
    await this.tokenService.blacklistAccessToken(accessTokenJti, accessToken);
    await this.tokenService.revokeRefreshTokenByValue(refreshToken);
  }

  async logoutAll(userId: string, accessTokenJti: string, accessToken: string) {
    await this.tokenService.blacklistAccessToken(accessTokenJti, accessToken);
    await this.tokenService.revokeAllRefreshTokensForUser(userId);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      const code = await this.otpService.issue(
        dto.email,
        OtpType.password_reset,
      );
      await this.mailService.sendOtpEmail(dto.email, code, 'reset');
    }

    return {
      message:
        'If an account with that email exists, a reset code has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw AppException.badRequest('Invalid or expired code.');
    }

    await this.otpService.verify(dto.email, OtpType.password_reset, dto.otp);

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await this.tokenService.revokeAllRefreshTokensForUser(user.id);
    await this.mailService.sendPasswordChangedEmail(user.email);

    return { message: 'Password has been reset. Please log in again.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw AppException.unauthorized('Invalid credentials.');
    }

    const isValid = await this.passwordService.verify(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw AppException.unauthorized('Current password is incorrect.');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await this.mailService.sendPasswordChangedEmail(user.email);

    return { message: 'Password changed.' };
  }

  async getSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  async revokeSession(userId: string, tokenId: string) {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });
    if (!session || session.userId !== userId) {
      throw AppException.notFound('Session not found.');
    }

    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { isRevoked: true },
    });
  }

  // ── Admin ────────────────────────────────────────────────

  async adminLogin(dto: AdminLoginDto): Promise<{ pendingToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (
      !user ||
      user.role !== UserRole.admin ||
      user.platformRole !== PlatformRole.super_admin ||
      !user.passwordHash
    ) {
      throw AppException.unauthorized('Invalid email or password.');
    }

    const isValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );
    if (!isValid) {
      throw AppException.unauthorized('Invalid email or password.');
    }

    if (!user.isActive) {
      throw AppException.forbidden('This account has been deactivated.');
    }

    const jwt = this.config.get('jwt', { infer: true });
    const pendingToken = this.jwtService.sign(
      { sub: user.id, stage: 'admin_2fa_pending' },
      { secret: jwt.accessSecret, expiresIn: '5m' },
    );

    return { pendingToken };
  }

  async adminTwoFactor(
    dto: AdminTwoFactorDto,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const jwt = this.config.get('jwt', { infer: true });

    let payload: { sub: string; stage: string };
    try {
      payload = this.jwtService.verify(dto.pendingToken, {
        secret: jwt.accessSecret,
      });
    } catch {
      throw AppException.unauthorized('Invalid or expired login attempt.');
    }

    if (payload.stage !== 'admin_2fa_pending') {
      throw AppException.unauthorized('Invalid or expired login attempt.');
    }

    const twoFactor = await this.prisma.adminTwoFactor.findUnique({
      where: { userId: payload.sub },
    });
    if (!twoFactor) {
      throw AppException.businessRule(
        'Two-factor authentication is not set up for this account.',
      );
    }

    const isValid = await this.twoFactorService.verify(
      dto.code,
      twoFactor.secret,
    );
    if (!isValid) {
      throw AppException.unauthorized('Invalid two-factor code.');
    }

    if (!twoFactor.isConfirmed) {
      await this.prisma.adminTwoFactor.update({
        where: { userId: payload.sub },
        data: { isConfirmed: true },
      });
    }

    const user = await this.prisma.user.update({
      where: { id: payload.sub },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issueTokenPair(user, {
      twoFactorConfirmed: true,
    });

    return { user, tokens };
  }
}
