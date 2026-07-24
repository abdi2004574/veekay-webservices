import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';

describe('Friends (e2e)', () => {
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

  it('sends, accepts a friend request, and lists both users as friends', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');
    const bob = await registerAndVerifyTraveler(server, 'bob@e2e.test', 'Bob');

    const sendRes = await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(201);

    const requestId = sendRes.body.data.id;

    const incomingRes = await request(server())
      .get('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(incomingRes.body.data).toHaveLength(1);
    expect(incomingRes.body.data[0].requester.username).toBeDefined();

    await request(server())
      .post(`/api/v1/friend-requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    const aliceFriends = await request(server())
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(aliceFriends.body.data.map((f: any) => f.id)).toContain(bob.userId);

    const bobFriends = await request(server())
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(bobFriends.body.data.map((f: any) => f.id)).toContain(alice.userId);
  });

  it('rejects a duplicate friend request and lets the addressee decline', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice2@e2e.test', 'Alice');
    const bob = await registerAndVerifyTraveler(server, 'bob2@e2e.test', 'Bob');

    await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(201);

    const dupeRes = await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(409);
    expect(dupeRes.body.error.code).toEqual('CONFLICT');

    const incoming = await request(server())
      .get('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    const requestId = incoming.body.data[0].id;

    await request(server())
      .post(`/api/v1/friend-requests/${requestId}/decline`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    const bobFriends = await request(server())
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(bobFriends.body.data).toHaveLength(0);
  });

  it('unfriends an accepted connection', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice3@e2e.test', 'Alice');
    const bob = await registerAndVerifyTraveler(server, 'bob3@e2e.test', 'Bob');

    const sendRes = await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(201);

    await request(server())
      .post(`/api/v1/friend-requests/${sendRes.body.data.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    await request(server())
      .delete(`/api/v1/friends/${bob.userId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const aliceFriends = await request(server())
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(aliceFriends.body.data).toHaveLength(0);
  });
});
