import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import Redis from 'ioredis';
import { AppException } from '../../../common/errors/app.exception';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';
import { blacklistKey } from '../auth.constants';
import { AppConfig } from '../../../config/configuration';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const isBlacklisted = await this.redis.get(blacklistKey(payload.jti));
    if (isBlacklisted) {
      throw AppException.unauthorized('Session has been revoked.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { agency: { select: { id: true } } },
    });

    if (!user) {
      throw AppException.unauthorized('User no longer exists.');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      platformRole: user.platformRole,
      jti: payload.jti,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      twoFactorConfirmed: payload.twoFactorConfirmed,
      agencyId: user.agency?.id,
    };
  }
}
