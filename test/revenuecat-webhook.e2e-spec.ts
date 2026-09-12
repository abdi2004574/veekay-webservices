import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { AgencySubscriptionTier, UserRole } from '@prisma/client';

describe('RevenueCat Webhook (e2e)', () => {
  let app: INestApplication<App>;
  const WEBHOOK_SECRET = 'test-revenuecat-secret';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDb();
    await disconnectRedis();
  });

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
  });

  const server = () => app.getHttpServer();

  function signPayload(body: string): string {
    const crypto = require('crypto');
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = timestamp + '.' + body;
    const hmac = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');
    return 't=' + timestamp + ',v1=' + hmac;
  }

  async function createAgency(userId: string, name: string) {
    await testPrisma.user.create({
      data: {
        id: userId,
        email: userId + '@test.com',
        username: userId,
        role: UserRole.agency,
        displayName: name,
      },
    });
    return testPrisma.agency.create({
      data: {
        userId,
        agencyName: name,
        subscriptionTier: AgencySubscriptionTier.basic,
      },
    });
  }

  function makeEvent(
    overrides: Partial<{
      type: string;
      id: string;
      original_app_user_id: string;
      app_user_id: string;
      entitlement_ids: string[];
      product_id: string;
      environment: string;
      aliases: Array<{ id: string }>;
    }> = {},
  ) {
    const now = Date.now();
    return {
      api_version: '1.0',
      event: {
        type: overrides.type ?? 'INITIAL_PURCHASE',
        id: overrides.id ?? 'evt-1',
        event_timestamp_ms: now,
        app_user_id: overrides.app_user_id,
        original_app_user_id: overrides.original_app_user_id,
        entitlement_ids: overrides.entitlement_ids ?? ['premium'],
        product_id: overrides.product_id,
        environment: overrides.environment ?? 'SANDBOX',
        aliases: overrides.aliases,
      },
    };
  }

  function postWebhook(payload: object, signature?: string) {
    const body = JSON.stringify(payload);
    const req = request(server())
      .post('/api/v1/revenuecat/webhook')
      .set('Content-Type', 'application/json');
    if (signature) {
      req.set('X-RevenueCat-Webhook-Signature', signature);
    }
    return req.send(body);
  }

  it('rejects request with invalid signature', async () => {
    const payload = makeEvent({ id: 'evt-1' });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);
    const invalidSignature =
      signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');

    const res = await postWebhook(payload, invalidSignature).expect(401);
    expect(res.body.error.code).toEqual('UNAUTHORIZED');
  });

  it('rejects request with missing signature', async () => {
    const payload = makeEvent({ id: 'evt-2' });
    await postWebhook(payload).expect(401);
  });

  it('processes valid purchase event and updates tier', async () => {
    const agency = await createAgency('rc-user-1', 'RevenueCat Test Agency');

    const payload = makeEvent({
      id: 'evt-3',
      original_app_user_id: agency.userId,
      entitlement_ids: ['premium'],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-3');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.premium);
  });

  it('is idempotent for duplicate event', async () => {
    const agency = await createAgency('rc-user-2', 'Idempotent Test Agency');

    const payload = makeEvent({
      id: 'evt-4',
      original_app_user_id: agency.userId,
      entitlement_ids: ['premium'],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res1 = await postWebhook(payload, signature).expect(200);
    const res2 = await postWebhook(payload, signature).expect(200);

    expect(res1.body.data.eventId).toBe('evt-4');
    expect(res2.body.data.eventId).toBe('evt-4');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.premium);
  });

  it('returns 404 for unknown agency', async () => {
    const payload = makeEvent({
      id: 'evt-5',
      original_app_user_id: 'nonexistent-user',
      entitlement_ids: ['premium'],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    await postWebhook(payload, signature).expect(404);
  });

  it('maps cancellation to basic tier', async () => {
    const agency = await createAgency('rc-user-3', 'Cancel Test Agency');

    const payload = makeEvent({
      id: 'evt-6',
      type: 'CANCELLATION',
      original_app_user_id: agency.userId,
      entitlement_ids: [],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-6');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.basic);
  });

  it('maps expiry to basic tier', async () => {
    const agency = await createAgency('rc-user-4', 'Expire Test Agency');

    const payload = makeEvent({
      id: 'evt-7',
      type: 'EXPIRATION',
      original_app_user_id: agency.userId,
      entitlement_ids: [],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-7');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.basic);
  });

  it('maps billing issue to basic tier', async () => {
    const agency = await createAgency('rc-user-5', 'Billing Issue Test Agency');

    const payload = makeEvent({
      id: 'evt-8',
      type: 'BILLING_ISSUE',
      original_app_user_id: agency.userId,
      entitlement_ids: [],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-8');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.basic);
  });

  it('supports aliases for agency lookup', async () => {
    const agency = await createAgency('rc-user-6', 'Alias Test Agency');

    const payload = makeEvent({
      id: 'evt-9',
      original_app_user_id: undefined,
      app_user_id: undefined,
      aliases: [{ id: agency.userId }],
      entitlement_ids: ['premium'],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-9');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.premium);
  });

  it('rejects unknown active entitlement to prevent downgrade', async () => {
    const agency = await createAgency(
      'rc-user-7',
      'Unknown Entitlement Agency',
    );

    const payload = makeEvent({
      id: 'evt-10',
      original_app_user_id: agency.userId,
      entitlement_ids: ['unknown_tier'],
      product_id: 'unknown_product',
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(400);
    expect(res.body.error.message).toContain('Unknown active entitlement');
  });

  it('uses known entitlement_id for tier mapping', async () => {
    const agency = await createAgency(
      'rc-user-8',
      'Entitlement Mapping Agency',
    );

    const payload = makeEvent({
      id: 'evt-11',
      original_app_user_id: agency.userId,
      entitlement_ids: ['featured'],
      product_id: 'prod-premium',
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-11');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.featured);
  });

  it('maps renewal to premium tier', async () => {
    const agency = await createAgency('rc-user-9', 'Renewal Test Agency');

    const payload = makeEvent({
      id: 'evt-12',
      type: 'RENEWAL',
      original_app_user_id: agency.userId,
      entitlement_ids: ['premium'],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-12');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.premium);
  });

  it('maps uncancelation to premium tier', async () => {
    const agency = await createAgency('rc-user-10', 'Uncancel Test Agency');

    const payload = makeEvent({
      id: 'evt-13',
      type: 'UNCANCELLATION',
      original_app_user_id: agency.userId,
      entitlement_ids: ['premium'],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-13');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.premium);
  });

  it('maps product change to new tier', async () => {
    const agency = await createAgency('rc-user-11', 'Product Change Agency');

    const payload = makeEvent({
      id: 'evt-14',
      type: 'PRODUCT_CHANGE',
      original_app_user_id: agency.userId,
      entitlement_ids: ['featured'],
      product_id: 'prod-featured',
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const res = await postWebhook(payload, signature).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.eventId).toBe('evt-14');

    const updated = await testPrisma.agency.findUnique({
      where: { id: agency.id },
    });
    expect(updated!.subscriptionTier).toBe(AgencySubscriptionTier.featured);
  });
});
