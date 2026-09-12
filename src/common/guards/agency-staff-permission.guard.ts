import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgencyStaffPermission, PrismaClient } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { REQUIRE_AGENCY_STAFF_PERMISSION_KEY } from '../decorators/require-agency-staff-permission.decorator';
import type { Request } from 'express';

const prisma = new PrismaClient();

@Injectable()
export class AgencyStaffPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      AgencyStaffPermission[]
    >(REQUIRE_AGENCY_STAFF_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw AppException.forbidden('Agency staff permission required.');
    }

    // Find the user's agency
    const agency = await prisma.agency.findFirst({
      where: { user: { id: user.userId } },
      select: { id: true },
    });

    if (!agency) {
      throw AppException.forbidden('No agency found for this user.');
    }

    // Get the user's staff permission in this agency
    const staff = await prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId: agency.id, userId: user.userId } },
    });

    if (!staff) {
      throw AppException.forbidden('You are not a member of this agency.');
    }

    const userPermission = staff.permission;
    const permissionHierarchy: Record<AgencyStaffPermission, number> = {
      owner: 3,
      admin: 2,
      support: 1,
      staff: 0,
    };

    const hasPermission = requiredPermissions.some(
      (required) =>
        permissionHierarchy[userPermission] >= permissionHierarchy[required],
    );

    if (!hasPermission) {
      throw AppException.forbidden(
        `This action requires one of the following agency staff permissions: ${requiredPermissions.join(', ')}.`,
      );
    }

    // Attach to request for use in controllers
    (request as any).agencyStaffPermission = userPermission;
    (request as any).agencyId = agency.id;

    return true;
  }
}
