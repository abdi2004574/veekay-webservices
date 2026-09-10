import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { Decimal } from '@prisma/client/runtime/library';

jest.mock('stripe', () => {
  const mockPaymentIntents = {
    create: jest.fn().mockResolvedValue({
      id: 'pi_mock_123',
      status: 'requires_payment_method',
      client_secret: 'pi_mock_123_secret_456',
      amount: 2500,
      currency: 'usd',
      metadata: {},
    }),
  };
  return jest.fn().mockImplementation(() => ({
    paymentIntents: mockPaymentIntents,
    webhooks: {
      constructEvent: jest.fn(),
    },
    accounts: {
      create: jest.fn().mockResolvedValue({
        id: 'acct_mock_123',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { card_payments: { status: 'active' } },
        requirements: { currently_due: [], due_set: { requirements_due: [] } },
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'acct_mock_123',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
      update: jest.fn().mockResolvedValue({ id: 'acct_mock_123' }),
      createExternalAccount: jest.fn().mockResolvedValue({
        id: 'ba_mock_123',
        account: 'acct_mock_123',
      }),
      createLoginLink: jest
        .fn()
        .mockResolvedValue({ url: 'https://connect.stripe.com/login' }),
    },
    accountLinks: {
      create: jest
        .fn()
        .mockResolvedValue({ url: 'https://connect.stripe.com/onboarding' }),
    },
    transfers: {
      create: jest.fn().mockResolvedValue({
        id: 'tr_mock_123',
        amount: 5000,
        currency: 'usd',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'tr_mock_123',
        amount: 5000,
        currency: 'usd',
      }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_mock_123' }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_mock_123',
        latest_invoice: { payment_intent: { client_secret: 'pi_mock_secret' } },
      }),
      list: jest.fn().mockResolvedValue({ data: [] }),
      cancel: jest
        .fn()
        .mockResolvedValue({ id: 'sub_mock_123', status: 'canceled' }),
    },
  }));
});

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;

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
    await clearMailhog();
  });

  const server = () => app.getHttpServer();

  describe('POST /campaigns/:id/donate', () => {
    async function seedCampaign(email: string) {
      const traveler = await registerAndVerifyTraveler(server, email, 'Donor');
      const campaign = await testPrisma.campaign.create({
        data: {
          creatorId: traveler.userId,
          title: 'Test Campaign',
          destination: 'Test',
          goalAmount: new Decimal(1000),
          currency: 'USD',
          tripStartDate: new Date('2027-01-01'),
          status: 'active',
          privacy: 'public',
        },
      });
      return { traveler, campaign };
    }

    it('creates a PaymentIntent and returns clientSecret for a valid donation', async () => {
      const { campaign } = await seedCampaign('donor-1@e2e.test');

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate`)
        .send({ amount: 25, currency: 'USD', donorDisplayName: 'John' })
        .expect(201);

      expect(res.body.data.clientSecret).toBeDefined();
      expect(res.body.data.paymentIntentId).toBe('pi_mock_123');
      expect(res.body.data.amount).toBe(25);
    });

    it('validates minimum donation amount', async () => {
      const { campaign } = await seedCampaign('donor-2@e2e.test');

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate`)
        .send({ amount: 0.1, currency: 'USD' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates currency length', async () => {
      const { campaign } = await seedCampaign('donor-3@e2e.test');

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate`)
        .send({ amount: 10, currency: 'US' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for a non-existent campaign', async () => {
      await request(server())
        .post('/api/v1/campaigns/00000000-0000-0000-0000-000000000000/donate')
        .send({ amount: 10, currency: 'USD' })
        .expect(404);
    });
  });

  describe('POST /webhooks/stripe', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const res = await request(server())
        .post('/api/v1/webhooks/stripe')
        .send({ type: 'payment_intent.succeeded', data: {} })
        .expect(400);

      expect(res.text).toContain('Webhook Error');
    });
  });
});
