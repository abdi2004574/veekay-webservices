import { Injectable, Logger } from '@nestjs/common';
import { AdminAuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

export type AdminAuditLogClient = Parameters<
  PrismaService['$transaction']
>[0] extends (arg: infer C) => unknown ? C : never;

@Injectable()
export class AdminAuditLogService {
  private readonly logger = new Logger(AdminAuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    actorId: string,
    action: string,
    targetType: string,
    targetId?: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<AdminAuditLog> {
    const entry = await this.prisma.adminAuditLog.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        reason,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'admin.audit_log.recorded',
        actorId,
        action,
        targetType,
        targetId,
      }),
    );

    return entry;
  }

  async findAll(
    filter: AuditLogFilterDto,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: AdminAuditLog[]; nextCursor: string | null }> {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
    };

    const items = await this.prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}

