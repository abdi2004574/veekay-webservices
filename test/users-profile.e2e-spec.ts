import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';

describe('Users profile: GET /me and GET /users/:id/profile (e2e)', () => {
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

  it('returns the current user’s own profile via GET /me, including a generated username', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

    const res = await request(server())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    expect(res.body.data.id).toEqual(alice.userId);
    expect(res.body.data.username).toBeTruthy();
    expect(res.body.data.friendsCount).toBe(0);
    expect(res.body.data.postsCount).toBe(0);
    expect(res.body.data.campaignsCount).toBe(0);
  });

  it('counts campaigns for real — including your own private ones, but hiding others’ private ones from strangers', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice5@e2e.test', 'Alice');
    const bob = await registerAndVerifyTraveler(server, 'bob5@e2e.test', 'Bob');

    const campaignPayload = {
      title: 'My Dream Trip',
      destination: 'Santorini, Greece',
      goalAmount: 1000,
      tripStartDate: '2026-09-15',
      giftMode: false,
      photoMediaIds: ['fake-media-1'],
    };
    await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...campaignPayload, privacy: 'public' })
      .expect(201);
    await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...campaignPayload, privacy: 'private' })
      .expect(201);

    const meRes = await request(server())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(meRes.body.data.campaignsCount).toBe(2);

    const strangerViewRes = await request(server())
      .get(`/api/v1/users/${alice.userId}/profile`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(strangerViewRes.body.data.campaignsCount).toBe(1);
  });

  it('returns another traveler’s public profile with isFriend and mutualFriendsCount', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice2@e2e.test', 'Alice');
    const bob = await registerAndVerifyTraveler(server, 'bob2@e2e.test', 'Bob');

    const beforeRes = await request(server())
      .get(`/api/v1/users/${bob.userId}/profile`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(beforeRes.body.data.isFriend).toBe(false);
    expect(beforeRes.body.data.username).toBeTruthy();
    expect(beforeRes.body.data.campaignsCount).toBe(0);
    expect(beforeRes.body.data.tripsCount).toBe(0);

    const sendRes = await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(201);
    await request(server())
      .post(`/api/v1/friend-requests/${sendRes.body.data.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    const afterRes = await request(server())
      .get(`/api/v1/users/${bob.userId}/profile`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(afterRes.body.data.isFriend).toBe(true);
    expect(afterRes.body.data.friendsCount).toBe(1);
  });

  it('searches travelers by username/display name, excluding self and annotating connection status', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice4@e2e.test', 'Alice');
    const bob = await registerAndVerifyTraveler(server, 'bob4@e2e.test', 'BobSearchable');

    const emptyRes = await request(server())
      .get('/api/v1/users/search?q=')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(emptyRes.body.data).toEqual([]);

    const searchRes = await request(server())
      .get('/api/v1/users/search?q=bobsearchable')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].id).toEqual(bob.userId);
    expect(searchRes.body.data[0].isFriend).toBe(false);
    expect(searchRes.body.data[0].requestSent).toBe(false);

    await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(201);

    const afterRequestRes = await request(server())
      .get('/api/v1/users/search?q=bobsearchable')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(afterRequestRes.body.data[0].requestSent).toBe(true);

    const selfSearchRes = await request(server())
      .get('/api/v1/users/search?q=alice')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(selfSearchRes.body.data.map((u: any) => u.id)).not.toContain(alice.userId);
  });

  it('returns 404 for a profile that does not exist', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice3@e2e.test', 'Alice');

    const res = await request(server())
      .get('/api/v1/users/00000000-0000-0000-0000-000000000000/profile')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(404);
    expect(res.body.error.code).toEqual('NOT_FOUND');
  });
});
