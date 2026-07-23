import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { OtpType } from '@prisma/client';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PasswordService } from './password.service';
import { otpResendCooldownKey } from './auth.constants';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async issue(identifier: string, type: OtpType): Promise<string> {
    const cooldownKey = otpResendCooldownKey(identifier, type);
    const onCooldown = await this.redis.get(cooldownKey);
    if (onCooldown) {
      throw AppException.rateLimited(
        'Please wait before requesting another code.',
      );
    }

    await this.prisma.otpCode.updateMany({
      where: { identifier, type, isUsed: false },
      data: { isUsed: true },
    });

    const code = this.generateCode();
    const codeHash = await this.passwordService.hash(code);
    const expiryMinutes = this.config.get('otp.expiryMinutes', {
      infer: true,
    });

    await this.prisma.otpCode.create({
      data: {
        identifier,
        type,
        codeHash,
        expiresAt: new Date(Date.now() + expiryMinutes * 60_000),
      },
    });

    const cooldownSeconds = this.config.get('otp.resendCooldownSeconds', {
      infer: true,
    });
    await this.redis.set(cooldownKey, '1', 'EX', cooldownSeconds);

    return code;
  }

  async verify(identifier: string, type: OtpType, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier, type, isUsed: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw AppException.badRequest('Invalid or expired code.');
    }

    if (otp.expiresAt < new Date()) {
      throw AppException.badRequest('Invalid or expired code.');
    }

    const maxAttempts = this.config.get('otp.maxAttempts', { infer: true });
    if (otp.attempts >= maxAttempts) {
      throw AppException.badRequest(
        'Too many incorrect attempts, request a new code.',
      );
    }

    const isValid = await this.passwordService.verify(code, otp.codeHash);
    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw AppException.badRequest('Invalid or expired code.');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });
  }
}
