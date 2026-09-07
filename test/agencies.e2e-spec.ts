import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import {
  registerAndVerifyAgency,
  approveAgency,
} from './utils/register-agency';
import { registerAndLoginAdmin } from './utils/register-admin';

describe('Admin Agencies (e2e)', () => {
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

  it('rejects non-admin access to admin agency endpoints', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice-admin@e2e.test',
      'Alice',
    );
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'agency-admin@e2e.test',
      'Test Agency',
    );

    await request(server())
      .get('/api/v1/admin/agencies/pending')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(403);

    await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/approve`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(403);

    await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/reject`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ reason: 'No thanks' })
      .expect(403);
  });

  it('lists pending agencies', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'pending1@e2e.test',
      'Pending Agency',
    );

    const res = await request(server())
      .get('/api/v1/admin/agencies/pending')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toEqual(agencyId);
    expect(res.body.data[0].status).toEqual('pending_verification');
    expect(res.body.data[0].user.email).toEqual('pending1@e2e.test');
  });

  it('approves a pending agency and sends confirmation email', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'approve1@e2e.test',
      'Approve Agency',
    );

    const res = await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/approve`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(201);

    expect(res.body.data.status).toEqual('approved');
    expect(res.body.data.agencyName).toEqual('Approve Agency');
  });

  it('rejects a pending agency with a reason and sends rejection email', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'reject1@e2e.test',
      'Reject Agency',
    );

    const res = await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/reject`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ reason: 'Business license document is unclear.' })
      .expect(201);

    expect(res.body.data.status).toEqual('rejected');
    expect(res.body.data.rejectionReason).toEqual(
      'Business license document is unclear.',
    );
  });

  it('prevents approving an already-approved agency', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'reapprove@e2e.test',
      'Reapprove Agency',
    );
    await approveAgency(agencyId);

    const res = await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/approve`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(422);

    expect(res.body.error.code).toEqual('BUSINESS_RULE');
  });

  it('prevents rejecting an already-rejected agency', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'rereject@e2e.test',
      'Rereject Agency',
    );

    await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/reject`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ reason: 'First rejection' })
      .expect(201);

    const res = await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/reject`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ reason: 'Second rejection' })
      .expect(422);

    expect(res.body.error.code).toEqual('BUSINESS_RULE');
  });

  it('returns 404 for non-existent agency on approve', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);

    await request(server())
      .post('/api/v1/admin/agencies/non-existent-id/approve')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(404);
  });

  it('requires a reason field for rejection', async () => {
    const { adminAccessToken } = await registerAndLoginAdmin(server);
    const { agencyId } = await registerAndVerifyAgency(
      server,
      'noreason@e2e.test',
      'No Reason Agency',
    );

    const res = await request(server())
      .post(`/api/v1/admin/agencies/${agencyId}/reject`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({})
      .expect(400);

    expect(res.body.error.code).toEqual('VALIDATION_ERROR');
  });
});
