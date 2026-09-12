import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { SocialAuthService } from './social-auth.service';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, AdminAuthController],
  providers: [
    AuthService,
    PasswordService,
    OtpService,
    TokenService,
    SocialAuthService,
    TwoFactorService,
    JwtStrategy,
  ],
  exports: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
