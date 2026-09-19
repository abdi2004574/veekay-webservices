import * as crypto from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { Agency, AgencySubscriptionTier } from '@prisma/client';
import {
  RevenueCatEventType,
  RevenueCatWebhookEnvelope,
  RevenueCatWebhookEvent,
  determineTierFromEvent,
  isActiveSubscriptionEvent,
  isDonationEvent,
  isDonationProduct,
  getDonationAmountFromProductId,
} from './revenuecat-webhook.dto';
import Redis from 'ioredis';
import { RevenueCatApiService } from './revenuecat-api.service';
import { WalletService } from '../wallet/wallet.service';

const IDEMPOTENCY_TTL_SECONDS = 86400;
const CLAIM_TTL_SECONDS = 300;

export type SubscriptionResult = {
  eventId: string;
  agencyId: string;
  tier: string;
};

export type DonationResult = {
  eventId: string;
  donationId: string;
  amount: number;
  campaignId: string;
  donorUserId: string;
};

@Injectable()
export class RevenueCatWebhookService {
  private readonly logger = new Logger(RevenueCatWebhookService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly revenueCatApiService: RevenueCatApiService,
    private readonly walletService: WalletService,
  ) {}

  async processDonationEvent(event: RevenueCatWebhookEvent): Promise<DonationResult> {
    const eventId = event.id;

    const donorUser = await this.prisma.user.findUnique({
      where: { id: event.app_user_id ?? '' },
    });
    if (!donorUser) {
      throw new Error('Donor user not found');
    }

    const attributes = await this.revenueCatApiService.getSubscriberAttributes(event.app_user_id ?? '');
    const campaignId = attributes.campaign_id?.value;
    if (!campaignId) {
      throw new Error('Campaign ID not found in subscriber attributes');
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const amount = getDonationAmountFromProductId(event.product_id);
    if (amount <= 0) {
      throw new Error('Invalid donation amount');
    }

    const idempotencyKey = event.transaction_id ?? event.id;

    const result = await this.walletService.recordDonation({
      campaignId,
      donorUserId: donorUser.id,
      donorDisplayName: donorUser.displayName ?? null,
      amount,
      currency: 'USD',
      isAnonymous: false,
      isGift: false,
      idempotencyKey,
      providerName: 'revenuecat',
    });

    return {
      eventId,
      donationId: result.donation!.id,
      amount,
      campaignId,
      donorUserId: donorUser.id,
    };
  }

  async processWebhook(
    envelope: RevenueCatWebhookEnvelope,
    signature: string,
    rawBody: string,
  ): Promise<SubscriptionResult | DonationResult | null> {
    if (!this.verifySignature(rawBody, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const { event } = envelope;
    const eventId = event.id;

    if (!eventId || typeof eventId !== 'string') {
      this.logger.warn(
        JSON.stringify({
          audit: 'revenuecat.webhook.invalid_event_id',
          eventId,
        }),
      );
      throw new Error('Invalid event ID');
    }

    const cacheKey = 'rc:evt:' + eventId;
    const claimKey = 'rc:claim:' + eventId;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log(
        JSON.stringify({ audit: 'revenuecat.webhook.duplicate', eventId }),
      );
      return JSON.parse(cached);
    }

    const claimed = await this.redis.set(
      claimKey,
      '1',
      'EX',
      CLAIM_TTL_SECONDS,
      'NX',
    );
    if (!claimed) {
      const existing = await this.redis.get(cacheKey);
      if (existing) {
        this.logger.log(
          JSON.stringify({
            audit: 'revenuecat.webhook.duplicate_race',
            eventId,
          }),
        );
        return JSON.parse(existing);
      }
      this.logger.warn(
        JSON.stringify({ audit: 'revenuecat.webhook.claim_failed', eventId }),
      );
      throw new Error('Could not claim event for processing');
    }

    try {
      if (!this.isSupportedEvent(event.type)) {
        this.logger.log(
          JSON.stringify({
            audit: 'revenuecat.webhook.unsupported',
            eventId,
            type: event.type,
          }),
        );
        await this.redis.set(
          cacheKey,
          JSON.stringify(null),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
        await this.redis.del(claimKey);
        return null;
      }

      if (isDonationEvent(event.type)) {
        if (!isDonationProduct(event.product_id)) {
          await this.redis.del(claimKey);
          this.logger.warn(
            JSON.stringify({
              audit: 'revenuecat.webhook.donation_invalid_product',
              eventId,
              productId: event.product_id,
            }),
          );
          throw new Error('Invalid donation product');
        }
        const donationResult = await this.processDonationEvent(event);
        await this.redis.set(
          cacheKey,
          JSON.stringify(donationResult),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
        await this.redis.del(claimKey);
        return donationResult;
      }

      let agency: Agency | null = null;

      if (event.original_app_user_id) {
        agency = await this.prisma.agency.findFirst({
          where: { userId: event.original_app_user_id },
        });
      }

      if (!agency && event.app_user_id) {
        agency = await this.prisma.agency.findFirst({
          where: { userId: event.app_user_id },
        });
      }

      if (!agency && event.aliases && event.aliases.length > 0) {
        const aliasIds = event.aliases.map((a) => a.id);
        const aliasUser = await this.prisma.user.findFirst({
          where: { id: { in: aliasIds } },
          select: { agency: true },
        });
        if (aliasUser && aliasUser.agency) {
          agency = aliasUser.agency;
        }
      }

      if (!agency) {
        await this.redis.del(claimKey);
        throw new Error('Agency not found for RevenueCat user');
      }

      const tierMapping =
        this.configService.get('revenuecat.tierMapping', {
          infer: true,
        }) ?? {};
      const defaultMapping: Record<string, string> = {
        basic: 'basic',
        premium: 'premium',
        featured: 'featured',
      };
      const mergedMapping = { ...defaultMapping, ...tierMapping };

      const tier = determineTierFromEvent(event, mergedMapping);

      if (isActiveSubscriptionEvent(event.type)) {
        const hasMappedEntitlement =
          event.entitlement_ids?.some(
            (eid) => mergedMapping[eid.toLowerCase()],
          ) ?? false;
        const hasMappedProduct = event.product_id
          ? mergedMapping[event.product_id]
          : false;
        if (!hasMappedEntitlement && !hasMappedProduct) {
          await this.redis.del(claimKey);
          this.logger.warn(
            JSON.stringify({
              audit: 'revenuecat.webhook.unknown_active_entitlement',
              eventId,
              agencyId: agency.id,
              entitlements: event.entitlement_ids,
              productId: event.product_id,
            }),
          );
          throw new Error(
            'Unknown active entitlement - ignoring to prevent downgrade',
          );
        }
      }

      if (
        !Object.values(AgencySubscriptionTier).includes(
          tier as AgencySubscriptionTier,
        )
      ) {
        await this.redis.del(claimKey);
        this.logger.warn(
          JSON.stringify({
            audit: 'revenuecat.webhook.invalid_tier',
            eventId,
            agencyId: agency.id,
            tier,
          }),
        );
        throw new Error('Invalid tier mapping result');
      }

      await this.prisma.agency.update({
        where: { id: agency.id },
        data: { subscriptionTier: tier as AgencySubscriptionTier },
      });

      const result: SubscriptionResult = { eventId, agencyId: agency.id, tier };

      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
      );
      await this.redis.del(claimKey);

      this.logger.log(
        JSON.stringify({
          audit: 'revenuecat.webhook.processed',
          eventId,
          agencyId: agency.id,
          tier,
        }),
      );

      return result;
    } catch (error) {
      await this.redis.del(claimKey);
      throw error;
    }
  }

  private isSupportedEvent(type: string): boolean {
    return [
      RevenueCatEventType.INITIAL_PURCHASE,
      RevenueCatEventType.RENEWAL,
      RevenueCatEventType.CANCELLATION,
      RevenueCatEventType.EXPIRATION,
      RevenueCatEventType.PRODUCT_CHANGE,
      RevenueCatEventType.UNCANCELLATION,
      RevenueCatEventType.BILLING_ISSUE,
      RevenueCatEventType.NON_SUBSCRIPTION_PURCHASE,
      RevenueCatEventType.SUBSCRIPTION_PAUSED,
      RevenueCatEventType.SUBSCRIPTION_EXTENDED,
      RevenueCatEventType.OFFER_REDEEMED,
    ].includes(type as RevenueCatEventType);
  }

  private verifySignature(rawBody: string, signature: string): boolean {
    if (!signature) return false;
    const secret = this.configService.get('revenuecat.webhookSecret', {
      infer: true,
    });
    if (!secret) return false;

    const parts = signature.split(',');
    let timestamp = '';
    let hmac = '';
    for (const part of parts) {
      const [key, ...valueParts] = part.split('=');
      const value = valueParts.join('=');
      if (key === 't') timestamp = value;
      if (key === 'v1') hmac = value;
    }

    if (!timestamp || !hmac) return false;

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    const tolerance =
      this.configService.get<number>('revenuecat.timestampToleranceSeconds', {
        infer: true,
      }) ?? 300;
    if (Math.abs(now - ts) > tolerance) return false;

    const payload = timestamp + '.' + rawBody;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(hmac);
    if (expectedBuf.length !== signatureBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }
}
