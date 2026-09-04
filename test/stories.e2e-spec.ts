import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';

describe('Stories (e2e)', () => {
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

  it('rejects a story with neither photo nor text', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice@e2e.test',
      'Alice',
    );

    const res = await request(server())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toEqual('VALIDATION_ERROR');
  });

  it('creates a text story, lists it for a friend, records a view, and likes it', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice2@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob2@e2e.test', 'Bob');

    const sendRes = await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ addresseeId: bob.userId })
      .expect(201);
    await request(server())
      .post(`/api/v1/friend-requests/${sendRes.body.data.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    const storyRes = await request(server())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        text: 'On the road!',
        backgroundColor: '#D701A8',
        textSize: 'medium',
      })
      .expect(201);
    const storyId = storyRes.body.data.id;

    const listRes = await request(server())
      .get('/api/v1/stories')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(listRes.body.data.map((s: any) => s.id)).toContain(storyId);

    await request(server())
      .post(`/api/v1/stories/${storyId}/view`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    await request(server())
      .post(`/api/v1/stories/${storyId}/like`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(201);

    const dupeLikeRes = await request(server())
      .post(`/api/v1/stories/${storyId}/like`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(409);
    expect(dupeLikeRes.body.error.code).toEqual('CONFLICT');
  });

  it('excludes an expired story from the active list', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice3@e2e.test',
      'Alice',
    );

    const storyRes = await request(server())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ text: 'Expiring soon' })
      .expect(201);

    await testPrisma.story.update({
      where: { id: storyRes.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const listRes = await request(server())
      .get('/api/v1/stories')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(listRes.body.data.map((s: any) => s.id)).not.toContain(
      storyRes.body.data.id,
    );

    await request(server())
      .post(`/api/v1/stories/${storyRes.body.data.id}/view`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(404);
  });
});
