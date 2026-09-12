import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Decimal } from '@prisma/client/runtime/library';
import { CampaignPrivacy, CampaignStatus } from '@prisma/client';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerApprovedAgency } from './utils/register-agency';

describe('Campaigns — Manual Donate (e2e)', () => {
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
  const IDK = (s: string) => `idem-donate-${s}`;

  async function createCampaign(creatorId: string, title = 'Test Trip') {
    return testPrisma.campaign.create({
      data: {
        creatorId,
        title,
        destination: 'Santorini, Greece',
        goalAmount: new Decimal(5000),
        tripStartDate: new Date('2026-08-15'),
        currency: 'USD',
        privacy: CampaignPrivacy.public,
        status: CampaignStatus.active,
        giftMode: false,
      },
    });
  }

  describe('POST /campaigns/:id/donate-manual', () => {
    it('credits creator wallet, increments raisedAmount, returns transaction id', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-donate-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-donate-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('happy1'))
        .send({ amount: 50, currency: 'USD' })
        .expect(201);

      expect(res.body.data.amount).toBe(50);
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.raisedAmount).toBe(50);
      expect(res.body.data.walletTransactionId).toBeDefined();

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(50);
    });

    it('returns 422 when donor is the campaign creator (self-donation)', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-self-1@e2e.test',
        'Creator',
      );
      const campaign = await createCampaign(creator.userId);

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .set('idempotency-key', IDK('self1'))
        .send({ amount: 50, currency: 'USD' })
        .expect(422);

      expect(res.body.error.code).toBe('BUSINESS_RULE');
    });

    it('returns 401 without auth', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-noauth-1@e2e.test',
        'Creator',
      );
      const campaign = await createCampaign(creator.userId);

      await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('idempotency-key', IDK('noauth1'))
        .send({ amount: 50, currency: 'USD' })
        .expect(401);
    });

    it('returns 403 when an agency tries to donate', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-agency-1@e2e.test',
        'Creator',
      );
      const agency = await registerApprovedAgency(
        server,
        'a-agency-1@e2e.test',
        'Agency',
      );
      const campaign = await createCampaign(creator.userId);

      await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${agency.agencyAccessToken}`)
        .set('idempotency-key', IDK('agency1'))
        .send({ amount: 50, currency: 'USD' })
        .expect(403);
    });

    it('returns 400 without Idempotency-Key header', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-noidk-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-noidk-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .send({ amount: 50, currency: 'USD' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for amount <= 0', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-amt-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-amt-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('amt1'))
        .send({ amount: 0, currency: 'USD' })
        .expect(400);
    });

    it('returns 400 for amount > 100000', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-amtmax-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-amtmax-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('amtmax1'))
        .send({ amount: 100001, currency: 'USD' })
        .expect(400);
    });

    it('returns 400 for invalid currency format (lowercase)', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-cur-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-cur-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('cur1'))
        .send({ amount: 50, currency: 'usd' })
        .expect(400);
    });

    it('returns 404 for a non-existent campaign', async () => {
      const donor = await registerAndVerifyTraveler(
        server,
        'd-404-1@e2e.test',
        'Donor',
      );

      await request(server())
        .post(
          '/api/v1/campaigns/00000000-0000-0000-0000-000000000000/donate-manual',
        )
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('notfound1'))
        .send({ amount: 50, currency: 'USD' })
        .expect(404);
    });

    it('defaults currency to USD when not provided in body', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-curdef-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-curdef-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('curdef1'))
        .send({ amount: 50 })
        .expect(201);

      expect(res.body.data.currency).toBe('USD');
    });

    it('idempotency replay: same key returns same transaction id, no double credit', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-replay-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-replay-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      const key = IDK('replay1');
      const first = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', key)
        .send({ amount: 50, currency: 'USD' })
        .expect(201);

      const second = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', key)
        .send({ amount: 50, currency: 'USD' })
        .expect(201);

      expect(second.body.data.walletTransactionId).toBe(
        first.body.data.walletTransactionId,
      );
      expect(second.body.data.raisedAmount).toBe(50);

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(50);
    });

    it('accumulates raisedAmount across multiple donors', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-multi-1@e2e.test',
        'Creator',
      );
      const donor1 = await registerAndVerifyTraveler(
        server,
        'd-multi-1@e2e.test',
        'Donor1',
      );
      const donor2 = await registerAndVerifyTraveler(
        server,
        'd-multi-2@e2e.test',
        'Donor2',
      );
      const campaign = await createCampaign(creator.userId);

      await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor1.accessToken}`)
        .set('idempotency-key', IDK('multi1'))
        .send({ amount: 100, currency: 'USD' })
        .expect(201);

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor2.accessToken}`)
        .set('idempotency-key', IDK('multi2'))
        .send({ amount: 75, currency: 'USD' })
        .expect(201);

      expect(res.body.data.raisedAmount).toBe(175);

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(175);
    });

    it('supports anonymous and gift donations', async () => {
      const creator = await registerAndVerifyTraveler(
        server,
        'c-gift-1@e2e.test',
        'Creator',
      );
      const donor = await registerAndVerifyTraveler(
        server,
        'd-gift-1@e2e.test',
        'Donor',
      );
      const campaign = await createCampaign(creator.userId);

      const res = await request(server())
        .post(`/api/v1/campaigns/${campaign.id}/donate-manual`)
        .set('Authorization', `Bearer ${donor.accessToken}`)
        .set('idempotency-key', IDK('gift1'))
        .send({
          amount: 25,
          currency: 'USD',
          donorDisplayName: 'Anonymous Samaritan',
          isAnonymous: true,
          isGift: true,
          giftMessage: 'Happy travels!',
        })
        .expect(201);

      expect(res.body.data.amount).toBe(25);
      expect(res.body.data.raisedAmount).toBe(25);

      const donation = await testPrisma.donation.findFirst({
        where: { walletTransactionId: res.body.data.walletTransactionId },
      });
      expect(donation).not.toBeNull();
      expect(donation?.isAnonymous).toBe(true);
      expect(donation?.isGift).toBe(true);
      expect(donation?.giftMessage).toBe('Happy travels!');
      expect(donation?.donorDisplayName).toBe('Anonymous Samaritan');
    });
  });
});
