import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AppConfig } from '../../../config/configuration';
import {
  FundingDepositRequest,
  FundingProviderResult,
  IFundingProvider,
} from '../interfaces/funding-provider.interface';

@Injectable()
export class StripeFundingProvider implements IFundingProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripeFundingProvider.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const secretKey = this.configService.get('stripe.secretKey', {
      infer: true,
    });
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  async deposit(
    request: FundingDepositRequest,
  ): Promise<FundingProviderResult> {
    if (!request.amount || request.amount <= 0) {
      return { ok: false, message: 'Amount must be greater than zero.' };
    }

    if (!this.stripe) {
      return { ok: false, message: 'Stripe is not configured.' };
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(request.amount * 100),
          currency: request.currency.toLowerCase(),
          metadata: {
            walletAccountId: request.walletAccountId,
            referenceType: request.referenceType,
            referenceId: request.referenceId,
            idempotencyKey: request.idempotencyKey,
          },
          description: request.description ?? 'Wallet deposit',
        },
        {
          idempotencyKey: `deposit-${request.idempotencyKey}`,
        },
      );

      this.logger.log(
        JSON.stringify({
          audit: 'stripe.deposit.payment_intent',
          externalId: paymentIntent.id,
          amount: request.amount,
          currency: request.currency,
          idempotencyKey: request.idempotencyKey,
          status: paymentIntent.status,
        }),
      );

      return {
        ok: paymentIntent.status === 'succeeded',
        externalId: paymentIntent.id,
        message:
          paymentIntent.status === 'succeeded'
            ? undefined
            : `PaymentIntent status: ${paymentIntent.status}`,
      };
    } catch (error) {
      this.logger.error(`Stripe deposit failed: ${(error as Error).message}`);
      return {
        ok: false,
        message: (error as Error).message,
      };
    }
  }

  getStripeInstance(): Stripe | null {
    return this.stripe;
  }
}
