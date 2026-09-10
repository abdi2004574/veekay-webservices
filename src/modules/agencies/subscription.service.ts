import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { AppConfig } from '../../config/configuration';
import { AgencySubscriptionTier } from '@prisma/client';

@Injectable()
export class AgencySubscriptionService {
  private readonly logger = new Logger(AgencySubscriptionService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    const secretKey = this.configService.get('stripe.secretKey', {
      infer: true,
    });
    this.stripe = new Stripe(secretKey);
  }

  async createOrUpdateSubscription(
    agencyId: string,
    tier: AgencySubscriptionTier,
  ): Promise<{ subscriptionId?: string; clientSecret?: string }> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      include: { user: { select: { email: true } } },
    });

    if (!agency) {
      throw new Error('Agency not found');
    }

    const priceId = this.getPriceIdForTier(tier);
    if (!priceId) {
      throw new Error(`No Stripe price configured for tier: ${tier}`);
    }

    const existing = await this.prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "StripeCustomer" WHERE "agencyId" = ${agencyId} LIMIT 1`;

    let stripeCustomerId: string;
    if (existing.length > 0) {
      stripeCustomerId = existing[0].id;
    } else {
      const stripeCustomer = await this.stripe.customers.create({
        email: agency.user.email,
        metadata: { agencyId },
      });
      stripeCustomerId = stripeCustomer.id;
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as any;
    const clientSecret = invoice?.payment_intent?.client_secret;

    await this.prisma.agency.update({
      where: { id: agencyId },
      data: { subscriptionTier: tier },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'stripe.subscription.created',
        agencyId,
        tier,
        subscriptionId: subscription.id,
        customerId: stripeCustomerId,
      }),
    );

    return {
      subscriptionId: subscription.id,
      clientSecret,
    };
  }

  async cancelSubscription(agencyId: string): Promise<void> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
    });

    if (!agency) {
      throw new Error('Agency not found');
    }

    const existing = await this.prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "StripeCustomer" WHERE "agencyId" = ${agencyId} LIMIT 1`;

    if (existing.length === 0) {
      return;
    }

    const stripeCustomerId = existing[0].id;
    const subscriptions = await this.stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      await this.stripe.subscriptions.cancel(subscriptions.data[0].id);
    }

    await this.prisma.agency.update({
      where: { id: agencyId },
      data: { subscriptionTier: AgencySubscriptionTier.basic },
    });
  }

  private getPriceIdForTier(tier: AgencySubscriptionTier): string | undefined {
    const prices = this.configService.get('stripe.subscriptionPrices', {
      infer: true,
    });
    switch (tier) {
      case AgencySubscriptionTier.basic:
        return prices.basic;
      case AgencySubscriptionTier.premium:
        return prices.premium;
      case AgencySubscriptionTier.featured:
        return prices.featured;
      default:
        return undefined;
    }
  }
}
