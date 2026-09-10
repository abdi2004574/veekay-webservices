import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StripeConnectService } from './stripe-connect.service';
import Stripe from 'stripe';
import { AppConfig } from '../../config/configuration';
import { WalletService } from '../wallet/wallet.service';

export interface CreatePayoutParams {
  agencyId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  description?: string;
}

export interface PayoutResult {
  ok: boolean;
  transferId?: string;
  message?: string;
}

@Injectable()
export class AgencyPayoutService {
  private readonly logger = new Logger(AgencyPayoutService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly walletService: WalletService,
  ) {
    const secretKey = this.configService.get('stripe.secretKey', {
      infer: true,
    });
    this.stripe = new Stripe(secretKey);
  }

  async createPayout(params: CreatePayoutParams): Promise<PayoutResult> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: params.agencyId },
      select: {
        id: true,
        stripeConnectAccounts: {
          take: 1,
          select: { stripeAccountId: true },
        },
      },
    });

    if (!agency || agency.stripeConnectAccounts.length === 0) {
      return {
        ok: false,
        message: 'Agency does not have a Stripe Connect account linked.',
      };
    }

    const stripeAccountId = agency.stripeConnectAccounts[0].stripeAccountId;
    const accountStatus =
      await this.stripeConnectService.getAccountStatus(stripeAccountId);

    if (!accountStatus.payoutsEnabled) {
      return {
        ok: false,
        message: 'Stripe Connect account does not have payouts enabled.',
      };
    }

    try {
      const transfer = await this.stripe.transfers.create(
        {
          amount: Math.round(params.amount * 100),
          currency: params.currency.toLowerCase(),
          destination: stripeAccountId,
          metadata: {
            agencyId: params.agencyId,
            idempotencyKey: params.idempotencyKey,
          },
          description: params.description ?? 'Agency payout',
        },
        {
          idempotencyKey: `payout-${params.idempotencyKey}`,
        },
      );

      this.logger.log(
        JSON.stringify({
          audit: 'stripe.payout.transfer_created',
          transferId: transfer.id,
          agencyId: params.agencyId,
          amount: params.amount,
          currency: params.currency,
        }),
      );

      return {
        ok: true,
        transferId: transfer.id,
      };
    } catch (error) {
      this.logger.error(
        `Stripe payout failed for agency ${params.agencyId}: ${(error as Error).message}`,
      );
      return {
        ok: false,
        message: (error as Error).message,
      };
    }
  }

  async getPayoutStatus(
    transferId: string,
  ): Promise<{ status: string; amount?: number; currency?: string }> {
    const transfer = await this.stripe.transfers.retrieve(transferId);
    const raw = transfer as any;
    return {
      status: raw.status ?? 'unknown',
      amount: raw.amount ? raw.amount / 100 : undefined,
      currency: raw.currency,
    };
  }
}
