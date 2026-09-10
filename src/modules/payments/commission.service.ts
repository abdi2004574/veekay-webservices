import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AppConfig } from '../../config/configuration';
import { WalletTransactionType } from '@prisma/client';

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  async applyCommission(
    agencyId: string,
    bookingPaymentTransactionId: string,
    commissionPercent: number,
  ): Promise<void> {
    if (commissionPercent <= 0) return;

    const tx = await this.prisma.walletTransaction.findUnique({
      where: { id: bookingPaymentTransactionId },
      select: { id: true, amount: true, currency: true, walletAccountId: true },
    });

    if (!tx) return;

    const commissionAmount = tx.amount.times(commissionPercent).dividedBy(100);

    if (commissionAmount.lessThanOrEqualTo(0)) return;

    const agencyWallet = await this.prisma.walletAccount.findUnique({
      where: { id: tx.walletAccountId },
      select: { id: true, userId: true, currency: true },
    });

    if (!agencyWallet) return;

    const idempotencyKey = `commission-${bookingPaymentTransactionId}`;
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { idempotencyKey, type: WalletTransactionType.commission },
    });
    if (existing) return;

    await this.walletService.debit({
      userId: agencyWallet.userId,
      amount: Number(commissionAmount.toString()),
      currency: agencyWallet.currency,
      type: WalletTransactionType.commission,
      referenceType: 'booking_payment',
      referenceId: bookingPaymentTransactionId,
      idempotencyKey,
      description: `Platform commission (${commissionPercent}%) on booking payment`,
    });

    this.logger.log(
      JSON.stringify({
        audit: 'commission.applied',
        agencyId,
        bookingPaymentTransactionId,
        commissionPercent,
        commissionAmount: Number(commissionAmount.toString()),
        currency: agencyWallet.currency,
      }),
    );
  }
}
