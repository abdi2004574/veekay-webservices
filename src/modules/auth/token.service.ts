import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, createHash } from 'crypto';
import { User } from '@prisma/client';
import Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import {
  asDurationString,
  parseDurationMs,
} from '../../common/utils/duration.util';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { blacklistKey } from './auth.constants';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueTokenPair(
    user: User,
    options: {
      deviceId?: string;
      deviceName?: string;
      twoFactorConfirmed?: boolean;
    } = {},
  ): Promise<TokenPair> {
    const jwt = this.config.get('jwt', { infer: true });

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      jti: randomUUID(),
      twoFactorConfirmed: options.twoFactorConfirmed,
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: jwt.accessSecret,
      expiresIn: asDurationString(jwt.accessExpiresIn),
    });

    const refreshJti = randomUUID();
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti: refreshJti,
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: jwt.refreshSecret,
      expiresIn: asDurationString(jwt.refreshExpiresIn),
    });

    await this.prisma.refreshToken.create({
      data: {
        id: refreshJti,
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        deviceId: options.deviceId,
        deviceName: options.deviceName,
        expiresAt: new Date(Date.now() + parseDurationMs(jwt.refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(
    refreshToken: string,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const jwt = this.config.get('jwt', { infer: true });

    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: jwt.refreshSecret,
      });
    } catch {
      throw AppException.unauthorized('Invalid or expired refresh token.');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    if (
      !stored ||
      stored.isRevoked ||
      stored.expiresAt < new Date() ||
      stored.tokenHash !== this.hashToken(refreshToken)
    ) {
      throw AppException.unauthorized('Invalid or expired refresh token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) {
      throw AppException.unauthorized('Invalid or expired refresh token.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const tokens = await this.issueTokenPair(user, {
      deviceId: stored.deviceId ?? undefined,
      deviceName: stored.deviceName ?? undefined,
    });

    return { user, tokens };
  }

  async blacklistAccessToken(jti: string, accessToken: string): Promise<void> {
    const jwt = this.config.get('jwt', { infer: true });
    let remainingSeconds = parseDurationMs(jwt.accessExpiresIn) / 1000;

    try {
      const decoded = this.jwtService.decode<{ exp?: number }>(accessToken);
      if (decoded?.exp) {
        remainingSeconds = Math.max(
          1,
          decoded.exp - Math.floor(Date.now() / 1000),
        );
      }
    } catch {
      // fall back to the default access-token lifetime
    }

    await this.redis.set(blacklistKey(jti), '1', 'EX', remainingSeconds);
  }

  async revokeRefreshTokenByValue(refreshToken: string): Promise<void> {
    const jwt = this.config.get('jwt', { infer: true });
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: jwt.refreshSecret,
      });
    } catch {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, tokenHash: this.hashToken(refreshToken) },
      data: { isRevoked: true },
    });
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }
}
