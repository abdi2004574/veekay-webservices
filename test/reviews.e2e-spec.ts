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

describe('Agency directory & reviews (e2e)', () => {
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

  describe('Agency directory', () => {
    it('excludes agencies still pending verification', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice1@e2e.test',
        'Alice',
      );
      await registerAndVerifyAgency(server, 'pending1@e2e.test', 'Pending Co.');

      const res = await request(server())
        .get('/api/v1/agencies')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('lists an approved agency and rejects fetching a pending one directly', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice2@e2e.test',
        'Alice',
      );
      const agency = await registerAndVerifyAgency(
        server,
        'agency2@e2e.test',
        'Dream Travel Co.',
      );
      await approveAgency(agency.agencyId);

      const listRes = await request(server())
        .get('/api/v1/agencies')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(listRes.body.data.items.map((a: any) => a.id)).toContain(
        agency.agencyId,
      );

      const detailRes = await request(server())
        .get(`/api/v1/agencies/${agency.agencyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(detailRes.body.data.agencyName).toEqual('Dream Travel Co.');
      expect(detailRes.body.data.reviewCount).toEqual(0);
      expect(detailRes.body.data.reputationScore).toBeNull();

      const pending = await registerAndVerifyAgency(
        server,
        'pending2@e2e.test',
        'Pending Co.',
      );
      await request(server())
        .get(`/api/v1/agencies/${pending.agencyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(404);
    });

    it('filters the directory by search text', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice3@e2e.test',
        'Alice',
      );
      const dream = await registerAndVerifyAgency(
        server,
        'dream3@e2e.test',
        'Dream Travel Co.',
      );
      const wander = await registerAndVerifyAgency(
        server,
        'wander3@e2e.test',
        'Wanderlust Co.',
      );
      await approveAgency(dream.agencyId);
      await approveAgency(wander.agencyId);

      const res = await request(server())
        .get('/api/v1/agencies?search=dream')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      const names = res.body.data.items.map((a: any) => a.agencyName);
      expect(names).toContain('Dream Travel Co.');
      expect(names).not.toContain('Wanderlust Co.');
    });
  });

  describe('Reviews', () => {
    it('rejects reviewing an agency still pending verification', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice4@e2e.test',
        'Alice',
      );
      const pending = await registerAndVerifyAgency(
        server,
        'pending4@e2e.test',
        'Pending Co.',
      );

      const res = await request(server())
        .post(`/api/v1/agencies/${pending.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 5, body: 'Great!' })
        .expect(404);
      expect(res.body.error.code).toEqual('NOT_FOUND');
    });

    it('creates a review, updates the agency reputation score, and rejects a duplicate', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice5@e2e.test',
        'Alice',
      );
      const bob = await registerAndVerifyTraveler(
        server,
        'bob5@e2e.test',
        'Bob',
      );
      const agency = await registerAndVerifyAgency(
        server,
        'agency5@e2e.test',
        'Dream Travel Co.',
      );
      await approveAgency(agency.agencyId);

      await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 5, body: 'Amazing service!' })
        .expect(201);

      await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ rating: 3 })
        .expect(201);

      const detailRes = await request(server())
        .get(`/api/v1/agencies/${agency.agencyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(detailRes.body.data.reputationScore).toEqual(4);
      expect(detailRes.body.data.reviewCount).toEqual(2);

      const dupeRes = await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 4 })
        .expect(409);
      expect(dupeRes.body.error.code).toEqual('CONFLICT');
    });

    it('lists reviews for an agency, newest first', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice6@e2e.test',
        'Alice',
      );
      const bob = await registerAndVerifyTraveler(
        server,
        'bob6@e2e.test',
        'Bob',
      );
      const agency = await registerAndVerifyAgency(
        server,
        'agency6@e2e.test',
        'Dream Travel Co.',
      );
      await approveAgency(agency.agencyId);

      await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 5, body: 'First review' })
        .expect(201);
      await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ rating: 4, body: 'Second review' })
        .expect(201);

      const res = await request(server())
        .get(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].body).toEqual('Second review');
      expect(res.body.data.items[0].reviewer.username).toBeDefined();
    });

    it('edits and deletes a review within the 7-day window, recomputing reputation each time', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice7@e2e.test',
        'Alice',
      );
      const agency = await registerAndVerifyAgency(
        server,
        'agency7@e2e.test',
        'Dream Travel Co.',
      );
      await approveAgency(agency.agencyId);

      const createRes = await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 3 })
        .expect(201);
      const reviewId = createRes.body.data.id;

      const updateRes = await request(server())
        .patch(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 5, body: 'Updated my mind — excellent!' })
        .expect(200);
      expect(updateRes.body.data.rating).toEqual(5);

      const afterUpdateRes = await request(server())
        .get(`/api/v1/agencies/${agency.agencyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(afterUpdateRes.body.data.reputationScore).toEqual(5);

      await request(server())
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);

      const afterDeleteRes = await request(server())
        .get(`/api/v1/agencies/${agency.agencyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(afterDeleteRes.body.data.reputationScore).toBeNull();
      expect(afterDeleteRes.body.data.reviewCount).toEqual(0);
    });

    it('rejects editing or deleting someone else’s review', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice8@e2e.test',
        'Alice',
      );
      const bob = await registerAndVerifyTraveler(
        server,
        'bob8@e2e.test',
        'Bob',
      );
      const agency = await registerAndVerifyAgency(
        server,
        'agency8@e2e.test',
        'Dream Travel Co.',
      );
      await approveAgency(agency.agencyId);

      const createRes = await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 4 })
        .expect(201);
      const reviewId = createRes.body.data.id;

      await request(server())
        .patch(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ rating: 1 })
        .expect(403);

      await request(server())
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(403);
    });

    it('lists my own reviews across agencies with canEdit reflecting the edit window', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice9@e2e.test',
        'Alice',
      );
      const agency = await registerAndVerifyAgency(
        server,
        'agency9@e2e.test',
        'Dream Travel Co.',
      );
      await approveAgency(agency.agencyId);

      await request(server())
        .post(`/api/v1/agencies/${agency.agencyId}/reviews`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ rating: 5, body: 'Loved it' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/reviews/mine')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].agencyName).toEqual('Dream Travel Co.');
      expect(res.body.data[0].canEdit).toBe(true);
    });
  });
});
