import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerAndLoginAdmin } from './utils/register-admin';

describe('Admin Panel (e2e)', () => {
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

  describe('Admin Invites', () => {
    it('admin can create an invite', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const res = await request(server())
        .post('/api/v1/admin/invites')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'newadmin@test.com',
          platformRole: 'super_admin',
          acceptUrl: 'http://localhost:57800/admin/invites/accept?token=xxx',
        })
        .expect(201);

      expect(res.body.data.email).toEqual('newadmin@test.com');
      expect(res.body.data.status).toEqual('pending');
    });

    it('non-admin cannot create invites', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-invite@test.com', 'T1');
      await request(server())
        .post('/api/v1/admin/invites')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ email: 'hack@test.com', platformRole: 'super_admin', acceptUrl: 'http://test' })
        .expect(403);
    });

    it('admin can list invites', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      await request(server())
        .post('/api/v1/admin/invites')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ email: 'list@test.com', platformRole: 'super_admin', acceptUrl: 'http://test' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/admin/invites')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('admin can revoke an invite', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const createRes = await request(server())
        .post('/api/v1/admin/invites')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ email: 'revoke@test.com', platformRole: 'super_admin', acceptUrl: 'http://test' })
        .expect(201);

      await request(server())
        .post(`/api/v1/admin/invites/${createRes.body.data.id}/revoke`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(201);

      const listRes = await request(server())
        .get('/api/v1/admin/invites')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(listRes.body.data[0].status).toEqual('revoked');
    });
  });

  describe('Content Reports', () => {
    it('traveler can create a report', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-report@test.com', 'T1');
      const res = await request(server())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ targetType: 'post', targetId: 'some-post-id', reason: 'Spam' })
        .expect(201);

      expect(res.body.data.reason).toEqual('Spam');
      expect(res.body.data.status).toEqual('pending');
    });

    it('cannot report own content', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-selfreport@test.com', 'T1');
      await request(server())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ targetType: 'post', targetId: traveler.userId, reason: 'Self report' })
        .expect(422);
    });

    it('admin can list reports', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const res = await request(server())
        .get('/api/v1/reports/admin/reports')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe('Verified Badges', () => {
    it('admin can assign a verified badge', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const traveler = await registerAndVerifyTraveler(server, 't-badge@test.com', 'T1');
      const res = await request(server())
        .post('/api/v1/admin/badges')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ subjectType: 'user', subjectId: traveler.userId })
        .expect(201);

      expect(res.body.data.subjectType).toEqual('user');
      expect(res.body.data.subjectId).toEqual(traveler.userId);
    });

    it('admin can list badges', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const res = await request(server())
        .get('/api/v1/admin/badges')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Audit Log', () => {
    it('admin can list audit logs', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const res = await request(server())
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe('High-Value Withdrawal', () => {
    it('rejects high-value withdrawal for unverified user', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-hv-unv@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      // Credit wallet with enough balance
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', 'idem-hv-1')
        .send({ amount: 2000, currency: 'USD', description: 'seed' });

      await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .set('idempotency-key', 'idem-hv-withdraw')
        .send({ amount: 1000, currency: 'USD' })
        .expect(422);
    });
  });

  describe('Group Fund Withdrawal', () => {
    it('group admin can withdraw group funds', async () => {
      const creator = await registerAndVerifyTraveler(server, 't-gw-creator@test.com', 'T1');

      // Create a group campaign
      const campaignRes = await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({
          title: 'Group Trip',
          destination: 'Paris',
          goalAmount: 500,
          tripStartDate: '2026-10-01',
          privacy: 'public',
          giftMode: false,
          photoMediaIds: ['fake-media-id'],
          isGroup: true,
        })
        .expect(201);

      const campaignId = campaignRes.body.data.id;

      // Add a contribution so there are funds to withdraw
      await request(server())
        .post(`/api/v1/campaigns/${campaignId}/group/contributions`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ amount: 50, currency: 'USD' })
        .expect(201);

      const withdrawRes = await request(server())
        .post(`/api/v1/campaigns/${campaignId}/group/withdraw`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ amount: 10, currency: 'USD' })
        .expect(201);

      expect(withdrawRes.body.data.status).toEqual('requested');
    });
  });
});
