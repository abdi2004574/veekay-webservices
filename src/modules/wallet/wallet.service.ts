import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PlatformRole,
  UserRole,
  WalletTransactionDirection,
  WalletTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { AdminCreditWalletDto } from './dto/admin-credit-wallet.dto';
import { CreateWithdrawalRequestDto } from './dto/create-withdrawal-request.dto';
import { ReviewWithdrawalRequestDto } from './dto/review-withdrawal-request.dto';
import { WalletTransactionFilterDto } from './dto/wallet-transaction-filter.dto';
import { FUNDING_PROVIDER } from './interfaces/funding-provider.interface';
import type { IFundingProvider } from './interfaces/funding-provider.interface';

export interface CreditParams {
  userId: string;
  amount: number;
  currency: string;
  type: WalletTransactionType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  description?: string;
}

export type DebitParams = CreditParams;

export interface RecordDonationParams {
  campaignId: string;
  donorUserId: string | null;
  donorDisplayName: string | null;
  amount: number;
  currency: string;
  isAnonymous: boolean;
  isGift: boolean;
  giftMessage?: string;
  idempotencyKey: string;
}

export type WalletTxClient = Parameters<
  PrismaService['$transaction']
>[0] extends (arg: infer C) => unknown
  ? C
  : never;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FUNDING_PROVIDER)
    private readonly fundingProvider: IFundingProvider,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly adminAuditLogService: AdminAuditLogService,
  ) {}

  async getOrCreateWalletAccount(userId: string, txClient?: WalletTxClient) {
    const client = (txClient ?? this.prisma) as PrismaService;
    const existing = await client.walletAccount.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    return client.walletAccount.create({
      data: { userId, currency: 'USD', cachedBalance: new Decimal(0) },
    });
  }

  async getMyWallet(userId: string) {
    const account = await this.getOrCreateWalletAccount(userId);
    return {
      id: account.id,
      currency: account.currency,
      balance: Number(account.cachedBalance.toString()),
      updatedAt: account.updatedAt,
    };
  }

  async credit(params: CreditParams) {
    return this._writeTransaction({
      ...params,
      direction: WalletTransactionDirection.credit,
    });
  }

  async debit(params: DebitParams) {
    return this._writeTransaction({
      ...params,
      direction: WalletTransactionDirection.debit,
    });
  }

  private async _writeTransaction(
    params: CreditParams & { direction: WalletTransactionDirection },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) return existing;

      const account = await this.getOrCreateWalletAccount(params.userId, tx);

      if (account.currency !== params.currency) {
        throw AppException.businessRule('Currency mismatch.');
      }

      const amount = new Decimal(params.amount);

      if (params.direction === WalletTransactionDirection.debit) {
        if (account.cachedBalance.lessThan(amount)) {
          throw AppException.businessRule('Insufficient wallet balance.');
        }
        await tx.walletAccount.update({
          where: { id: account.id },
          data: { cachedBalance: { decrement: amount } },
        });
      } else {
        await tx.walletAccount.update({
          where: { id: account.id },
          data: { cachedBalance: { increment: amount } },
        });
      }

      const created = await tx.walletTransaction.create({
        data: {
          walletAccountId: account.id,
          direction: params.direction,
          amount,
          currency: params.currency,
          type: params.type,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          idempotencyKey: params.idempotencyKey,
          description: params.description,
        },
      });

      this.logger.log(
        JSON.stringify({
          audit: 'wallet.transaction',
          actorUserId: params.userId,
          walletAccountId: account.id,
          direction: params.direction,
          amount: Number(amount.toString()),
          currency: params.currency,
          type: params.type,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          idempotencyKey: params.idempotencyKey,
          provider: this.fundingProvider.name,
        }),
      );

      return created;
    });
  }

  async adminCredit(
    adminUserId: string,
    targetUserId: string,
    dto: AdminCreditWalletDto,
    idempotencyKey: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    });
    if (!target || !target.isActive) {
      throw AppException.notFound('Target user not found.');
    }

    const result = await this.fundingProvider.deposit({
      walletAccountId: '',
      amount: dto.amount,
      currency: dto.currency,
      referenceType: 'manual_admin_credit',
      referenceId: idempotencyKey,
      idempotencyKey,
      description: dto.description,
    });

    if (!result.ok) {
      throw AppException.businessRule(
        result.message ?? 'Funding provider declined the deposit.',
      );
    }

    const transaction = await this.credit({
      userId: targetUserId,
      amount: dto.amount,
      currency: dto.currency,
      type: WalletTransactionType.donation_received,
      referenceType: 'manual_admin_credit',
      referenceId: idempotencyKey,
      idempotencyKey,
      description: `Admin credit by ${adminUserId}: ${dto.description ?? ''}`,
    });

    return transaction;
  }

  async recordDonation(params: RecordDonationParams) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        const donation = await tx.donation.findFirst({
          where: { walletTransactionId: existing.id },
        });
        return { donation, transaction: existing };
      }

      const campaign = await tx.campaign.findUnique({
        where: { id: params.campaignId },
        select: { id: true, creatorId: true },
      });
      if (!campaign) {
        throw AppException.notFound('Campaign not found.');
      }

      const creator = await tx.user.findUnique({
        where: { id: campaign.creatorId },
        select: { id: true, isActive: true, role: true },
      });
      if (!creator || !creator.isActive || creator.role === UserRole.admin) {
        throw AppException.businessRule(
          'Campaign creator cannot receive donations in their current state.',
        );
      }

      const donation = await tx.donation.create({
        data: {
          campaignId: params.campaignId,
          donorUserId: params.donorUserId,
          donorDisplayName: params.donorDisplayName,
          amount: new Decimal(params.amount),
          currency: params.currency,
          isAnonymous: params.isAnonymous,
          isGift: params.isGift,
          giftMessage: params.giftMessage,
          walletTransactionId: null,
        },
      });

      const creatorAccount = await this.getOrCreateWalletAccount(
        creator.id,
        tx,
      );
      if (creatorAccount.currency !== params.currency) {
        throw AppException.businessRule('Currency mismatch.');
      }

      const amount = new Decimal(params.amount);

      await tx.walletAccount.update({
        where: { id: creatorAccount.id },
        data: { cachedBalance: { increment: amount } },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletAccountId: creatorAccount.id,
          direction: WalletTransactionDirection.credit,
          amount,
          currency: params.currency,
          type: WalletTransactionType.donation_received,
          referenceType: 'donation',
          referenceId: donation.id,
          idempotencyKey: params.idempotencyKey,
          description: params.isGift
            ? `Gift donation to campaign ${params.campaignId}`
            : `Donation to campaign ${params.campaignId}`,
        },
      });

      await tx.campaign.update({
        where: { id: params.campaignId },
        data: { raisedAmount: { increment: amount } },
      });

      await tx.donation.update({
        where: { id: donation.id },
        data: { walletTransactionId: transaction.id },
      });

      this.logger.log(
        JSON.stringify({
          audit: 'wallet.transaction',
          actorUserId: creator.id,
          walletAccountId: creatorAccount.id,
          direction: WalletTransactionDirection.credit,
          amount: Number(amount.toString()),
          currency: params.currency,
          type: WalletTransactionType.donation_received,
          referenceType: 'donation',
          referenceId: donation.id,
          idempotencyKey: params.idempotencyKey,
          provider: this.fundingProvider.name,
          donationId: donation.id,
        }),
      );

      try {
        const donorLabel = params.isAnonymous
          ? 'Someone'
          : params.donorDisplayName ?? 'Someone';
        await this.notificationsService.create(creator.id, {
          type: 'donation' as any,
          title: 'New Donation',
          body: `${donorLabel} donated $${params.amount} to your campaign`,
          deepLinkTarget: 'campaign',
          deepLinkEntityId: params.campaignId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send donation notification for campaign ${params.campaignId}: ${(error as Error).message}`,
        );
      }

      const feePercentage = this.configService.get('wallet.donationFeePercentage', { infer: true });
      if (feePercentage > 0) {
        const fee = amount.times(feePercentage).dividedBy(100);
        if (fee.greaterThan(0)) {
          await this.debit({
            userId: creator.id,
            amount: Number(fee.toString()),
            currency: params.currency,
            type: WalletTransactionType.donation_fee,
            referenceType: 'donation',
            referenceId: donation.id,
            idempotencyKey: `${params.idempotencyKey}-fee`,
            description: `Platform donation fee (${feePercentage}%)`,
          });
        }
      }

      return {
        donation: { ...donation, walletTransactionId: transaction.id },
        transaction,
      };
    });
  }

  async listTransactions(userId: string, filter: WalletTransactionFilterDto) {
    const account = await this.getOrCreateWalletAccount(userId);
    const limit = filter.limit ?? 20;

    const where = {
      walletAccountId: account.id,
      ...(filter.type ? { type: filter.type } : {}),
    };

    const items = await this.prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async requestWithdrawal(
    userId: string,
    dto: CreateWithdrawalRequestDto,
    idempotencyKey: string,
  ) {
    const account = await this.getOrCreateWalletAccount(userId);

    if (account.currency !== dto.currency) {
      throw AppException.businessRule('Currency mismatch.');
    }
    if (account.cachedBalance.lessThan(new Decimal(dto.amount))) {
      throw AppException.businessRule('Insufficient wallet balance.');
    }

    const threshold = this.configService.get('wallet.highValueWithdrawalThreshold', { infer: true });
    if (dto.amount >= threshold) {
      const profile = await this.prisma.travelerProfile.findUnique({
        where: { userId },
      });
      if (!profile || !profile.identityVerified) {
        throw AppException.businessRule(
          'Identity verification is required for withdrawals of \$1,000 or more. Please complete identity verification in your profile.',
        );
      }
    }

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        userId,
        campaignId: dto.campaignId,
        amount: new Decimal(dto.amount),
        currency: dto.currency,
        status: WithdrawalStatus.requested,
        highValueThreshold: dto.amount >= threshold ? new Decimal(threshold) : null,
      },
    });

    if (dto.amount >= threshold) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, email: true },
      });
      const admins = await this.prisma.user.findMany({
        where: { platformRole: PlatformRole.super_admin, isActive: true },
        select: { id: true },
      });
      for (const admin of admins) {
        try {
          await this.notificationsService.create(admin.id, {
            type: 'system_alert' as any,
            title: 'High-Value Withdrawal Requested',
            body: `User ${user?.username ?? userId} requested a $${dto.amount} withdrawal.`,
            deepLinkTarget: 'admin-wallet',
          });
        } catch (error) {
          this.logger.error(`Failed to send high-value withdrawal alert: ${(error as Error).message}`);
        }
      }
    }

    this.logger.log(
      JSON.stringify({
        audit: 'wallet.withdrawal.requested',
        actorUserId: userId,
        withdrawalId: request.id,
        amount: Number(request.amount.toString()),
        currency: request.currency,
        campaignId: request.campaignId,
        idempotencyKey,
      }),
    );

    return request;
  }

  async listMyWithdrawals(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const items = await this.prisma.withdrawalRequest.findMany({
      where: { userId },
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

  async getWithdrawalDetail(
    withdrawalId: string,
    callerId: string,
    callerRole: UserRole,
  ) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!request) {
      throw AppException.notFound('Withdrawal request not found.');
    }

    if (callerRole === UserRole.traveler || callerRole === UserRole.agency) {
      if (request.userId !== callerId) {
        throw AppException.notFound('Withdrawal request not found.');
      }
      return request;
    }

    throw AppException.forbidden('You do not have access to this request.');
  }

  async getWithdrawalDetailForAdmin(withdrawalId: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
    });
    if (!request) {
      throw AppException.notFound('Withdrawal request not found.');
    }
    return request;
  }

  async reviewWithdrawal(
    adminUserId: string,
    withdrawalId: string,
    dto: ReviewWithdrawalRequestDto,
  ) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!request) {
      throw AppException.notFound('Withdrawal request not found.');
    }
    if (request.status !== WithdrawalStatus.requested) {
      throw AppException.businessRule(
        'Only requested withdrawals can be reviewed.',
      );
    }

    if (dto.decision === 'rejected') {
      try {
        await this.notificationsService.create(request.userId, {
          type: 'withdrawal_status' as any,
          title: 'Withdrawal Update',
          body: `Your withdrawal request was rejected. Reason: ${dto.reason ?? 'Not specified'}`,
          deepLinkTarget: 'wallet',
        });
      } catch (error) {
        this.logger.error(
          `Failed to send withdrawal_status notification for withdrawal ${withdrawalId}: ${(error as Error).message}`,
        );
      }
      return this.rejectWithdrawal(adminUserId, withdrawalId, dto.reason);
    }

    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.approved },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'wallet.withdrawal.reviewed',
        actorUserId: adminUserId,
        withdrawalId,
        decision: 'approved',
        previousStatus: WithdrawalStatus.requested,
        nextStatus: WithdrawalStatus.approved,
      }),
    );

    try {
      await this.notificationsService.create(request.userId, {
        type: 'withdrawal_status' as any,
        title: 'Withdrawal Update',
        body: 'Your withdrawal request has been approved.',
        deepLinkTarget: 'wallet',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send withdrawal_status notification for withdrawal ${withdrawalId}: ${(error as Error).message}`,
      );
    }

    return updated;
  }

  async markWithdrawalPaid(
    _internalSystem: string,
    withdrawalId: string,
    idempotencyKey: string,
  ) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!request) {
      throw AppException.notFound('Withdrawal request not found.');
    }
    if (request.status !== WithdrawalStatus.approved) {
      throw AppException.businessRule(
        'Only approved withdrawals can be marked paid.',
      );
    }

    const transaction = await this.debit({
      userId: request.userId,
      amount: Number(request.amount.toString()),
      currency: request.currency,
      type: WalletTransactionType.withdrawal,
      referenceType: 'withdrawal_request',
      referenceId: request.id,
      idempotencyKey,
      description: `Withdrawal ${request.id} paid`,
    });

    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.paid,
        walletTransactionId: transaction.id,
      },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'wallet.withdrawal.paid',
        actorUserId: _internalSystem,
        withdrawalId,
        walletTransactionId: transaction.id,
        amount: Number(request.amount.toString()),
        currency: request.currency,
      }),
    );

    try {
      await this.notificationsService.create(request.userId, {
        type: 'withdrawal_status' as any,
        title: 'Withdrawal Paid',
        body: 'Your withdrawal has been paid.',
        deepLinkTarget: 'wallet',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send withdrawal_status notification for withdrawal ${withdrawalId}: ${(error as Error).message}`,
      );
    }

    return updated;
  }

  async rejectWithdrawal(
    adminUserId: string,
    withdrawalId: string,
    reason?: string,
  ) {
    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.rejected,
        rejectionReason: reason,
      },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'wallet.withdrawal.reviewed',
        actorUserId: adminUserId,
        withdrawalId,
        decision: 'rejected',
        reason: reason ?? null,
      }),
    );

    return updated;
  }

  async listAllWithdrawals(
    status: WithdrawalStatus | undefined,
    cursor: string | undefined,
    limit: number,
  ) {
    const items = await this.prisma.withdrawalRequest.findMany({
      where: { ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async updateRefundNote(
    adminUserId: string,
    withdrawalId: string,
    note: string,
  ) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!request) {
      throw AppException.notFound('Withdrawal request not found.');
    }

    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { refundNote: note },
    });

    await this.adminAuditLogService.record(
      adminUserId,
      'wallet.withdrawal.refund_note_updated',
      'withdrawal_request',
      withdrawalId,
      undefined,
      { refundNote: note },
    );

    return updated;
  }
}

