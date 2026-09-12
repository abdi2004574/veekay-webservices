import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { AgencySubscriptionTier } from '@prisma/client';
import {
  RevenueCatEventType,
  RevenueCatWebhookEnvelope,
  RevenueCatWebhookEvent,
  determineTierFromEvent,
  isActiveSubscriptionEvent,
  isCancellationOrExpirationEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from './revenuecat-webhook.dto';
import Redis from 'ioredis';
import crypto from 'crypto';

jest.mock('crypto', () => ({
  createHmac: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue({
      digest: jest.fn().mockReturnValue('expected-hmac'),
    }),
  }),
  timingSafeEqual: jest.fn().mockImplementation((a: Buffer, b: Buffer) => {
    return a.toString() === b.toString();
  }),
  randomBytes: jest.fn().mockReturnValue(Buffer.from('test')),
}));

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

describe('RevenueCatWebhookService', () => {
  let service: RevenueCatWebhookService;
  let prisma: any;

  beforeEach(async () => {
    const configService = {
      get: jest.fn((key: string, opts?: any) => {
        if (key === 'revenuecat.webhookSecret') return 'test-secret';
        if (key === 'revenuecat.tierMapping')
          return {
            basic: 'basic',
            premium: 'premium',
            featured: 'featured',
            'prod-premium': 'premium',
            'prod-featured': 'featured',
          };
        if (key === 'revenuecat.timestampToleranceSeconds') return 999999999;
        return undefined as any;
      }),
    } as unknown as ConfigService<AppConfig, true>;

    prisma = {
      agency: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };

    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RevenueCatWebhookService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = moduleRef.get<RevenueCatWebhookService>(RevenueCatWebhookService);
  });

  const validPayload: RevenueCatWebhookEnvelope = {
    api_version: '1.0',
    event: {
      type: RevenueCatEventType.INITIAL_PURCHASE,
      id: 'evt-123',
      event_timestamp_ms: Date.now(),
      original_app_user_id: 'agency-user-1',
      entitlement_ids: ['premium'],
      product_id: 'prod-premium',
      environment: 'SANDBOX',
    },
  };

  function signPayload(body: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = timestamp + '.' + body;
    const hmac = crypto
      .createHmac('sha256', 'test-secret')
      .update(signedPayload)
      .digest('hex');
    return 't=' + timestamp + ',v1=' + hmac;
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('processes purchase event and updates agency tier to premium', async () => {
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const body = JSON.stringify(validPayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(validPayload, signature, body);

    expect(result!.eventId).toBe('evt-123');
    expect(result!.tier).toBe('premium');
    expect(prisma.agency.update).toHaveBeenCalledWith({
      where: { id: 'agency-1' },
      data: { subscriptionTier: AgencySubscriptionTier.premium },
    });
  });

  it('throws on invalid signature', async () => {
    prisma.agency.findFirst.mockResolvedValue({ id: 'agency-1' });
    const body = JSON.stringify(validPayload);
    await expect(
      service.processWebhook(validPayload, 'bad-signature', body),
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('throws when agency not found', async () => {
    prisma.agency.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const body = JSON.stringify(validPayload);
    const signature = signPayload(body);
    await expect(
      service.processWebhook(validPayload, signature, body),
    ).rejects.toThrow('Agency not found for RevenueCat user');
  });

  it('is idempotent - returns cached result for duplicate event', async () => {
    const cached = JSON.stringify({
      eventId: 'evt-123',
      agencyId: 'agency-1',
      tier: 'premium',
    });
    mockRedis.get.mockResolvedValueOnce(cached);

    const body = JSON.stringify(validPayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(validPayload, signature, body);

    expect(result!.tier).toBe('premium');
    expect(prisma.agency.update).not.toHaveBeenCalled();
  });

  it('maps cancellation to basic tier', async () => {
    const cancelPayload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.CANCELLATION,
        entitlement_ids: [],
        product_id: undefined,
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.basic,
    });

    const body = JSON.stringify(cancelPayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(cancelPayload, signature, body);

    expect(result!.tier).toBe('basic');
  });

  it('maps expiry to basic tier', async () => {
    const expiredPayload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.EXPIRATION,
        entitlement_ids: [],
        product_id: undefined,
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.basic,
    });

    const body = JSON.stringify(expiredPayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(
      expiredPayload,
      signature,
      body,
    );

    expect(result!.tier).toBe('basic');
  });

  it('maps billing issue to basic tier', async () => {
    const billingIssuePayload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.BILLING_ISSUE,
        entitlement_ids: [],
        product_id: undefined,
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.basic,
    });

    const body = JSON.stringify(billingIssuePayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(
      billingIssuePayload,
      signature,
      body,
    );

    expect(result!.tier).toBe('basic');
  });

  it('maps renewal to premium tier', async () => {
    const renewalPayload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: { ...validPayload.event, type: RevenueCatEventType.RENEWAL },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const body = JSON.stringify(renewalPayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(
      renewalPayload,
      signature,
      body,
    );

    expect(result!.tier).toBe('premium');
  });

  it('maps renewal with featured entitlement to featured tier', async () => {
    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.RENEWAL,
        entitlement_ids: ['featured'],
        product_id: undefined,
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.featured,
    });

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const result = await service.processWebhook(payload, signature, body);

    expect(result!.tier).toBe('featured');
  });

  it('maps uncancelation to premium tier', async () => {
    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.UNCANCELLATION,
        entitlement_ids: ['premium'],
        product_id: undefined,
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const result = await service.processWebhook(payload, signature, body);

    expect(result!.tier).toBe('premium');
  });

  it('maps product change to new tier', async () => {
    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.PRODUCT_CHANGE,
        entitlement_ids: ['featured'],
        product_id: 'prod-featured',
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.featured,
    });

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const result = await service.processWebhook(payload, signature, body);

    expect(result!.tier).toBe('featured');
  });

  it('returns null for unsupported event type', async () => {
    const unsupportedPayload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: { ...validPayload.event, type: 'UNKNOWN_EVENT' },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });

    const body = JSON.stringify(unsupportedPayload);
    const signature = signPayload(body);

    const result = await service.processWebhook(
      unsupportedPayload,
      signature,
      body,
    );

    expect(result).toBeNull();
    expect(prisma.agency.update).not.toHaveBeenCalled();
  });

  it('throws when signature is empty', async () => {
    prisma.agency.findFirst.mockResolvedValue({ id: 'agency-1' });
    const body = JSON.stringify(validPayload);
    await expect(
      service.processWebhook(validPayload, '', body),
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('uses original_app_user_id when present', async () => {
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const body = JSON.stringify(validPayload);
    const signature = signPayload(body);

    await service.processWebhook(validPayload, signature, body);

    expect(prisma.agency.findFirst).toHaveBeenCalledWith({
      where: { userId: 'agency-user-1' },
    });
  });

  it('supports aliases for agency lookup', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'agency-user-1',
      agency: { id: 'agency-1', userId: 'agency-user-1' },
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        original_app_user_id: undefined,
        app_user_id: undefined,
        aliases: [{ id: 'agency-user-1' }],
        entitlement_ids: ['premium'],
      },
    };
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    await service.processWebhook(payload, signature, body);

    expect(prisma.user.findFirst).toHaveBeenCalled();
  });

  it('throws on invalid event ID', async () => {
    const invalidPayload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: { ...validPayload.event, id: '' },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });

    const body = JSON.stringify(invalidPayload);
    const signature = signPayload(body);

    await expect(
      service.processWebhook(invalidPayload, signature, body),
    ).rejects.toThrow('Invalid event ID');
  });

  it('rejects unknown active entitlement to prevent downgrade', async () => {
    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.INITIAL_PURCHASE,
        entitlement_ids: ['unknown_tier'],
        product_id: 'unknown_product',
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    await expect(
      service.processWebhook(payload, signature, body),
    ).rejects.toThrow(
      'Unknown active entitlement - ignoring to prevent downgrade',
    );
    expect(prisma.agency.update).not.toHaveBeenCalled();
  });

  it('allows unknown entitlement for cancellation events', async () => {
    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        type: RevenueCatEventType.CANCELLATION,
        entitlement_ids: ['unknown_tier'],
        product_id: undefined,
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.basic,
    });

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const result = await service.processWebhook(payload, signature, body);

    expect(result!.tier).toBe('basic');
  });

  it('falls back to product_id when entitlement_ids unmapped', async () => {
    const payload: RevenueCatWebhookEnvelope = {
      ...validPayload,
      event: {
        ...validPayload.event,
        entitlement_ids: ['unknown'],
        product_id: 'prod-premium',
      },
    };
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const result = await service.processWebhook(payload, signature, body);

    expect(result!.tier).toBe('premium');
  });

  it('race-safe idempotency - claim prevents duplicate processing', async () => {
    prisma.agency.findFirst.mockResolvedValue({
      id: 'agency-1',
      userId: 'agency-user-1',
    });
    prisma.agency.update.mockResolvedValue({
      id: 'agency-1',
      subscriptionTier: AgencySubscriptionTier.premium,
    });

    const body = JSON.stringify(validPayload);
    const signature = signPayload(body);

    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const result1 = await service.processWebhook(validPayload, signature, body);
    expect(result1!.tier).toBe('premium');

    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        eventId: 'evt-123',
        agencyId: 'agency-1',
        tier: 'premium',
      }),
    );

    const result2 = await service.processWebhook(validPayload, signature, body);
    expect(result2!.tier).toBe('premium');
    expect(prisma.agency.update).toHaveBeenCalledTimes(1);
  });

  it('determineTierFromEvent maps entitlement ids via tier mapping', () => {
    const event: RevenueCatWebhookEvent = {
      type: RevenueCatEventType.INITIAL_PURCHASE,
      id: 'evt-1',
      event_timestamp_ms: Date.now(),
      entitlement_ids: ['premium'],
      product_id: undefined,
    };
    const tier = determineTierFromEvent(event, {
      basic: 'basic',
      premium: 'premium',
      featured: 'featured',
    });
    expect(tier).toBe('premium');
  });

  it('determineTierFromEvent maps product id via tier mapping', () => {
    const event: RevenueCatWebhookEvent = {
      type: RevenueCatEventType.INITIAL_PURCHASE,
      id: 'evt-1',
      event_timestamp_ms: Date.now(),
      entitlement_ids: undefined,
      product_id: 'prod-premium',
    };
    const tier = determineTierFromEvent(event, {
      'prod-premium': 'premium',
      'prod-basic': 'basic',
    });
    expect(tier).toBe('premium');
  });

  it('determineTierFromEvent returns basic for cancellation', () => {
    const event: RevenueCatWebhookEvent = {
      type: RevenueCatEventType.CANCELLATION,
      id: 'evt-1',
      event_timestamp_ms: Date.now(),
      entitlement_ids: undefined,
      product_id: undefined,
    };
    const tier = determineTierFromEvent(event, {});
    expect(tier).toBe('basic');
  });

  it('determineTierFromEvent returns basic for billing issue', () => {
    const event: RevenueCatWebhookEvent = {
      type: RevenueCatEventType.BILLING_ISSUE,
      id: 'evt-1',
      event_timestamp_ms: Date.now(),
      entitlement_ids: undefined,
      product_id: undefined,
    };
    const tier = determineTierFromEvent(event, {});
    expect(tier).toBe('basic');
  });

  it('determineTierFromEvent returns basic for unsupported event type', () => {
    const event: RevenueCatWebhookEvent = {
      type: 'UNKNOWN',
      id: 'evt-1',
      event_timestamp_ms: Date.now(),
      entitlement_ids: ['premium'],
      product_id: undefined,
    };
    const tier = determineTierFromEvent(event, { premium: 'premium' });
    expect(tier).toBe('basic');
  });

  it('isActiveSubscriptionEvent returns true for active events', () => {
    expect(
      isActiveSubscriptionEvent(RevenueCatEventType.INITIAL_PURCHASE),
    ).toBe(true);
    expect(isActiveSubscriptionEvent(RevenueCatEventType.RENEWAL)).toBe(true);
    expect(isActiveSubscriptionEvent(RevenueCatEventType.PRODUCT_CHANGE)).toBe(
      true,
    );
    expect(isActiveSubscriptionEvent(RevenueCatEventType.UNCANCELLATION)).toBe(
      true,
    );
    expect(
      isActiveSubscriptionEvent(RevenueCatEventType.NON_SUBSCRIPTION_PURCHASE),
    ).toBe(true);
    expect(
      isActiveSubscriptionEvent(RevenueCatEventType.SUBSCRIPTION_EXTENDED),
    ).toBe(true);
    expect(isActiveSubscriptionEvent(RevenueCatEventType.OFFER_REDEEMED)).toBe(
      true,
    );
  });

  it('isActiveSubscriptionEvent returns false for cancellation/expiration', () => {
    expect(isActiveSubscriptionEvent(RevenueCatEventType.CANCELLATION)).toBe(
      false,
    );
    expect(isActiveSubscriptionEvent(RevenueCatEventType.EXPIRATION)).toBe(
      false,
    );
    expect(isActiveSubscriptionEvent(RevenueCatEventType.BILLING_ISSUE)).toBe(
      false,
    );
  });

  it('isCancellationOrExpirationEvent returns true for cancellation/expiration', () => {
    expect(
      isCancellationOrExpirationEvent(RevenueCatEventType.CANCELLATION),
    ).toBe(true);
    expect(
      isCancellationOrExpirationEvent(RevenueCatEventType.EXPIRATION),
    ).toBe(true);
    expect(
      isCancellationOrExpirationEvent(RevenueCatEventType.BILLING_ISSUE),
    ).toBe(true);
  });

  it('isCancellationOrExpirationEvent returns false for active events', () => {
    expect(
      isCancellationOrExpirationEvent(RevenueCatEventType.INITIAL_PURCHASE),
    ).toBe(false);
    expect(isCancellationOrExpirationEvent(RevenueCatEventType.RENEWAL)).toBe(
      false,
    );
  });
});
