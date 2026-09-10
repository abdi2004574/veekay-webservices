import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { FraudFlag, FraudFlagStatus, FraudFlagType, FraudFlagSeverity } from '@prisma/client';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly adminAuditLogService: AdminAuditLogService,
  ) {}

  async create(userId: string, dto: { type: FraudFlagType; severity: FraudFlagSeverity; description: string; metadata?: string }): Promise<FraudFlag> {
    let parsedMetadata: Record<string, unknown> | undefined;
    if (dto.metadata) {
      try {
        parsedMetadata = JSON.parse(dto.metadata);
      } catch {
        parsedMetadata = { raw: dto.metadata };
      }
    }

    const flag = await this.prisma.fraudFlag.create({
      data: {
        userId,
        type: dto.type,
        severity: dto.severity ?? FraudFlagSeverity.low,
        description: dto.description,
        metadata: parsedMetadata as any,
      },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'fraud.flag.created',
        userId,
        flagId: flag.id,
        type: dto.type,
        severity: dto.severity,
      }),
    );

    return flag;
  }

  async findAll(filter: { type?: FraudFlagType; status?: FraudFlagStatus; userId?: string }, cursor?: string, limit = 20): Promise<{ items: FraudFlag[]; nextCursor: string | null }> {
    const where: any = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.userId) where.userId = filter.userId;

    const items = await this.prisma.fraudFlag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, username: true, email: true } }, reviewedBy: { select: { id: true, username: true } } },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async findOne(id: string): Promise<FraudFlag> {
    const flag = await this.prisma.fraudFlag.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, email: true } }, reviewedBy: { select: { id: true, username: true } } },
    });
    if (!flag) throw AppException.notFound('Fraud flag not found.');
    return flag;
  }

  async review(actorId: string, id: string, dto: { status: FraudFlagStatus; resolutionNote?: string }): Promise<FraudFlag> {
    const flag = await this.prisma.fraudFlag.findUnique({ where: { id } });
    if (!flag) throw AppException.notFound('Fraud flag not found.');

    const updated = await this.prisma.fraudFlag.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote ?? null,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });

    await this.adminAuditLogService.record(
      actorId,
      'fraud.flag.reviewed',
      'fraud_flag',
      id,
      dto.resolutionNote,
      { previousStatus: flag.status, newStatus: dto.status },
    );

    this.logger.log(
      JSON.stringify({
        audit: 'fraud.flag.reviewed',
        actorId,
        flagId: id,
        status: dto.status,
      }),
    );

    return updated;
  }

  async checkFrequentProfileChanges(userId: string): Promise<FraudFlag | null> {
    const threshold = this.configService.get('fraud.profileChangeThreshold', { infer: true });
    const windowDays = this.configService.get('fraud.profileChangeWindowDays', { infer: true });
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    // We don't have a dedicated profile_change_log table, so we'll count
    // user.updatedAt changes as a proxy. In a real system this would be
    // a dedicated audit table.
    const recentUpdates = await this.prisma.user.count({
      where: {
        id: userId,
        updatedAt: { gte: windowStart },
      },
    });

    // This is a simplified check — the real implementation would track
    // actual profile field changes in a separate log table.
    if (recentUpdates > threshold) {
      return this.create(userId, {
        type: FraudFlagType.frequent_profile_changes,
        severity: FraudFlagSeverity.low,
        description: `User profile updated ${recentUpdates} times in the last ${windowDays} days (threshold: ${threshold}).`,
        metadata: JSON.stringify({ updatesInWindow: recentUpdates, threshold, windowDays }),
      });
    }

    return null;
  }

  async checkPaymentMethodMismatch(userId: string, paymentDetails: { nameOnCard?: string; billingZip?: string }): Promise<FraudFlag | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { travelerProfile: true },
    });

    if (!user || !user.travelerProfile) return null;

    const mismatches: string[] = [];
    if (paymentDetails.nameOnCard && user.displayName && paymentDetails.nameOnCard.toLowerCase() !== user.displayName.toLowerCase()) {
      mismatches.push('name');
    }

    if (mismatches.length > 0) {
      return this.create(userId, {
        type: FraudFlagType.payment_method_mismatch,
        severity: FraudFlagSeverity.medium,
        description: `Payment details mismatch: ${mismatches.join(', ')}.`,
        metadata: JSON.stringify({ mismatches, paymentDetails }),
      });
    }

    return null;
  }

  async checkWithdrawalAnomaly(userId: string, amount: number, currency: string): Promise<FraudFlag | null> {
    const threshold = this.configService.get('wallet.highValueWithdrawalThreshold', { infer: true });
    
    if (amount >= threshold) {
      const recentWithdrawals = await this.prisma.withdrawalRequest.findMany({
        where: { userId, status: { in: ['approved', 'paid'] as any } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });

      return this.create(userId, {
        type: FraudFlagType.withdrawal_anomaly,
        severity: FraudFlagSeverity.high,
        description: `High-value withdrawal of $${amount} ${currency} requested (threshold: $${threshold}).`,
        metadata: JSON.stringify({ amount, currency, threshold, recentWithdrawalCount: recentWithdrawals.length }),
      });
    }

    return null;
  }
}