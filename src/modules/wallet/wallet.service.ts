import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  UserRole,
  WalletTransactionDirection,
  WalletTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
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

// Inferred from PrismaService rather than `Prisma.TransactionClient` to
// avoid the `isolatedModules` + `emitDecoratorMetadata` clash that fires
// when a Prisma-namespaced type appears in a NestJS-injected method sig.
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

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        userId,
        campaignId: dto.campaignId,
        amount: new Decimal(dto.amount),
        currency: dto.currency,
        status: WithdrawalStatus.requested,
        highValueThreshold: null,
      },
    });

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
      return this.rejectWithdrawal(adminUserId, withdrawalId, dto.reason);
    }

    // TODO: external payout wiring pending funding-rail decision. When the
    // client confirms the funding-rail processor (JazzCash / Easypaisa / bank
    // gateway / Stripe Connect - TBD) we wire the actual external transfer
    // here. For now, approving a withdrawal simply marks it ready to be
    // processed - the wallet ledger is NOT yet debited; debit happens when the
    // processor webhook signals a successful external transfer
    // (see markWithdrawalPaid).
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

    return updated;
  }

  async markWithdrawalPaid(
    _internalSystem: string,
    withdrawalId: string,
    idempotencyKey: string,
  ) {
    // NOTE: This is intended to be called by the (TBD) processor webhook
    // handler once a successful external transfer is confirmed. For the MVP
    // it is exposed via the admin-only `mark-paid` route so ops staff can
    // manually reconcile transfers that happened outside the system. When
    // the processor is integrated, remove the admin endpoint and call this
    // method only from the webhook handler.
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
}
