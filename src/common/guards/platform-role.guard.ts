import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { REQUIRE_PLATFORM_ROLE_KEY } from '../decorators/require-platform-role.decorator';
import type { Request } from 'express';

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[]>(
      REQUIRE_PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.platformRole)) {
      throw AppException.forbidden('Super admin access required.');
    }

    if (!user.twoFactorConfirmed) {
      throw AppException.forbidden('Two-factor confirmation required.');
    }

    return true;
  }
}
