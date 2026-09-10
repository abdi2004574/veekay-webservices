import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerAndLoginAdmin } from './utils/register-admin';

describe('Fraud (e2e)', () => {
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

  describe('Create Fraud Flag', () => {
    it('admin can create a fraud flag (201)', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const res = await request(server())
        .post('/api/v1/admin/fraud')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          type: 'payment_method_mismatch',
          description: 'Card name does not match profile',
        })
        .expect(201);

      expect(res.body.data.type).toEqual('payment_method_mismatch');
      expect(res.body.data.status).toEqual('open');
    });

    it('non-admin cannot create fraud flags (403)', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        't-fraud@test.com',
        'T1',
      );
      await request(server())
        .post('/api/v1/admin/fraud')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({
          type: 'payment_method_mismatch',
          description: 'Should fail',
        })
        .expect(403);
    });
  });

  describe('List Fraud Flags', () => {
    it('admin can list fraud flags (200)', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      await request(server())
        .post('/api/v1/admin/fraud')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          type: 'withdrawal_anomaly',
          description: 'Suspicious withdrawal',
        })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/admin/fraud')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Review Fraud Flag', () => {
    it('admin can review a fraud flag (200)', async () => {
      const { adminAccessToken } = await registerAndLoginAdmin(server);
      const createRes = await request(server())
        .post('/api/v1/admin/fraud')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          type: 'payment_method_mismatch',
          description: 'Card name mismatch',
        })
        .expect(201);

      const flagId = createRes.body.data.id;

      const res = await request(server())
        .patch(`/api/v1/admin/fraud/${flagId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          status: 'resolved',
          resolutionNote: 'Verified with user',
        })
        .expect(200);

      expect(res.body.data.status).toEqual('resolved');
      expect(res.body.data.resolutionNote).toEqual('Verified with user');
    });
  });
});
