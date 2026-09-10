import { Controller, Post, Headers, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import Stripe from 'stripe';
import { StripeConnectService } from './stripe-connect.service';
import { WalletService } from '../wallet/wallet.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { AppConfig } from '../../config/configuration';
import { ConfigService } from '@nestjs/config';

@Public()
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly stripeConnectService: StripeConnectService,
    private readonly walletService: WalletService,
    private readonly adminAuditLogService: AdminAuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {
    const secretKey = this.configService.get('stripe.secretKey', {
      infer: true,
    });
    this.stripe = new Stripe(secretKey);
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const webhookSecret = this.configService.get('stripe.webhookSecret', {
      infer: true,
    });

    let event: Stripe.Event;
    try {
      const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.error(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
      return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    try {
      await this.routeEvent(event);
      return res.status(200).send({ received: true });
    } catch (err) {
      this.logger.error(
        `Webhook handler failed for ${event.type}: ${(err as Error).message}`,
      );
      return res.status(500).send('Webhook handler error');
    }
  }

  private async routeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object);
        break;
      case 'account.updated':
        await this.handleAccountUpdated(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      default:
        this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const metadata = paymentIntent.metadata as Record<string, string>;
    const {
      campaignId,
      donorUserId,
      donorDisplayName,
      isAnonymous,
      isGift,
      giftMessage,
    } = metadata;

    if (!campaignId) {
      this.logger.warn('PaymentIntent succeeded without campaignId metadata');
      return;
    }

    const idempotencyKey = `stripe-${paymentIntent.id}`;

    try {
      const result = await this.walletService.recordDonation({
        campaignId,
        donorUserId: donorUserId === 'anonymous' ? null : (donorUserId ?? null),
        donorDisplayName: donorDisplayName ?? 'Anonymous',
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        isAnonymous: isAnonymous === 'true',
        isGift: isGift === 'true',
        giftMessage: giftMessage ?? undefined,
        idempotencyKey,
      });

      this.logger.log(
        JSON.stringify({
          audit: 'stripe.webhook.donation_recorded',
          paymentIntentId: paymentIntent.id,
          campaignId,
          donationId: result.donation?.id,
          amount: paymentIntent.amount,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to record donation for PI ${paymentIntent.id}: ${(err as Error).message}`,
      );
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    this.logger.warn(
      JSON.stringify({
        audit: 'stripe.webhook.payment_failed',
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        lastPaymentError: (paymentIntent as any).last_payment_error?.message,
      }),
    );
  }

  private async handleAccountUpdated(account: Stripe.Account) {
    this.logger.log(
      JSON.stringify({
        audit: 'stripe.webhook.account_updated',
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      }),
    );
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const raw = invoice as any;
    this.logger.log(
      JSON.stringify({
        audit: 'stripe.webhook.invoice_payment_succeeded',
        invoiceId: invoice.id,
        customer: raw.customer,
        subscription: raw.subscription,
        amountPaid: invoice.amount_paid,
      }),
    );
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    this.logger.log(
      JSON.stringify({
        audit: 'stripe.webhook.subscription_updated',
        subscriptionId: subscription.id,
        customer: subscription.customer as string,
        status: subscription.status,
      }),
    );
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    this.logger.log(
      JSON.stringify({
        audit: 'stripe.webhook.subscription_deleted',
        subscriptionId: subscription.id,
        customer: subscription.customer as string,
      }),
    );
  }
}
