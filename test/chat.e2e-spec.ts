import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerAndVerifyAgency } from './utils/register-agency';

describe('Chat: conversations & messages (e2e)', () => {
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

  async function befriend(a: { accessToken: string }, b: { userId: string; accessToken: string }) {
    const sendRes = await request(server())
      .post('/api/v1/friend-requests')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ addresseeId: b.userId })
      .expect(201);
    await request(server())
      .post(`/api/v1/friend-requests/${sendRes.body.data.id}/accept`)
      .set('Authorization', `Bearer ${b.accessToken}`)
      .expect(201);
  }

  describe('Direct conversations', () => {
    it('rejects starting a direct conversation with a non-friend', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice1@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob1@e2e.test', 'Bob');

      const res = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'direct', participantId: bob.userId })
        .expect(403);
      expect(res.body.error.code).toEqual('FORBIDDEN');
    });

    it('creates a direct conversation between friends and reuses it on a second call', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice2@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob2@e2e.test', 'Bob');
      await befriend(alice, bob);

      const firstRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'direct', participantId: bob.userId })
        .expect(201);

      const secondRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ type: 'direct', participantId: alice.userId })
        .expect(201);

      expect(secondRes.body.data.id).toEqual(firstRes.body.data.id);
    });

    it('sends messages, marks them delivered/read, and reflects unread counts', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice3@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob3@e2e.test', 'Bob');
      await befriend(alice, bob);

      const convoRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'direct', participantId: bob.userId })
        .expect(201);
      const conversationId = convoRes.body.data.id;

      await request(server())
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'text', body: 'Hey Bob!' })
        .expect(201);

      const unreadRes = await request(server())
        .get('/api/v1/conversations/unread-count')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
      expect(unreadRes.body.data.count).toEqual(1);

      // Bob fetching the messages marks them delivered for him.
      const bobListRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
      expect(bobListRes.body.data.items[0].body).toEqual('Hey Bob!');

      // Alice should now see it as delivered (not yet read).
      const aliceListRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(aliceListRes.body.data.items[0].status).toEqual('delivered');

      await request(server())
        .post(`/api/v1/conversations/${conversationId}/read`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(201);

      const aliceListAfterRead = await request(server())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(aliceListAfterRead.body.data.items[0].status).toEqual('read');

      const unreadAfterRead = await request(server())
        .get('/api/v1/conversations/unread-count')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
      expect(unreadAfterRead.body.data.count).toEqual(0);
    });

    it('sends a real uploaded photo as an image message and resolves mediaUrl', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice4@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob4@e2e.test', 'Bob');
      await befriend(alice, bob);

      const convoRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'direct', participantId: bob.userId })
        .expect(201);
      const conversationId = convoRes.body.data.id;

      const urlRes = await request(server())
        .post('/api/v1/storage/upload-url')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ contentType: 'image/jpeg', purpose: 'chat_image' })
        .expect(201);
      const { uploadUrl, mediaId } = urlRes.body.data;

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: Buffer.from('fake-chat-photo-bytes'),
      });
      await request(server())
        .post('/api/v1/storage/confirm')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ mediaId })
        .expect(201);

      const sendRes = await request(server())
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'image', mediaId })
        .expect(201);
      expect(sendRes.body.data.mediaUrl).toContain('http');

      const listRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
      expect(listRes.body.data.items[0].mediaUrl).toContain('http');
    });

    it('rejects a stranger from accessing a conversation they are not part of', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice5@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob5@e2e.test', 'Bob');
      const stranger = await registerAndVerifyTraveler(server, 'stranger5@e2e.test', 'Stranger');
      await befriend(alice, bob);

      const convoRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'direct', participantId: bob.userId })
        .expect(201);

      const res = await request(server())
        .get(`/api/v1/conversations/${convoRes.body.data.id}/messages`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(403);
      expect(res.body.error.code).toEqual('FORBIDDEN');
    });
  });

  describe('Group conversations', () => {
    it('rejects creating a group with a non-friend member', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice6@e2e.test', 'Alice');
      const stranger = await registerAndVerifyTraveler(server, 'stranger6@e2e.test', 'Stranger');

      const res = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'group', title: 'Bali Trip', participantIds: [stranger.userId] })
        .expect(403);
      expect(res.body.error.code).toEqual('FORBIDDEN');
    });

    it('creates a group, lets an admin add/remove members, and lets a member leave', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice7@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob7@e2e.test', 'Bob');
      const carol = await registerAndVerifyTraveler(server, 'carol7@e2e.test', 'Carol');
      await befriend(alice, bob);
      await befriend(alice, carol);

      const createRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'group', title: 'Bali Trip 2026', participantIds: [bob.userId] })
        .expect(201);
      const conversationId = createRes.body.data.id;

      const detailRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(detailRes.body.data.members).toHaveLength(2);

      // Bob (a member, not admin) cannot add Carol.
      await request(server())
        .post(`/api/v1/conversations/${conversationId}/participants`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ userIds: [carol.userId] })
        .expect(403);

      // Alice (admin) can.
      await request(server())
        .post(`/api/v1/conversations/${conversationId}/participants`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ userIds: [carol.userId] })
        .expect(201);

      const afterAddRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(afterAddRes.body.data.members).toHaveLength(3);

      // Bob leaves on his own.
      await request(server())
        .delete(`/api/v1/conversations/${conversationId}/participants/${bob.userId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);

      // Carol (not an admin) cannot remove Alice.
      await request(server())
        .delete(`/api/v1/conversations/${conversationId}/participants/${alice.userId}`)
        .set('Authorization', `Bearer ${carol.accessToken}`)
        .expect(403);

      const afterLeaveRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(afterLeaveRes.body.data.members).toHaveLength(2);
    });
  });

  describe('Agency conversations (shared staff inbox)', () => {
    it('lets a traveler message an agency and any staff member reply from the shared inbox', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice8@e2e.test', 'Alice');
      const agency = await registerAndVerifyAgency(server, 'agency8@e2e.test', 'Dream Travel Co.');

      const convoRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'agency', agencyId: agency.agencyId })
        .expect(201);
      const conversationId = convoRes.body.data.id;

      await request(server())
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'text', body: 'Hi, interested in your Bali package!' })
        .expect(201);

      // The agency owner (staff), who has no explicit participant row, can still see and reply.
      const staffListRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .expect(200);
      expect(staffListRes.body.data.items[0].body).toContain('Bali package');

      await request(server())
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .send({ type: 'text', body: 'We would love to help!' })
        .expect(201);

      const unreadRes = await request(server())
        .get('/api/v1/conversations/unread-count')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(unreadRes.body.data.count).toEqual(1);

      await request(server())
        .post(`/api/v1/conversations/${conversationId}/read`)
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .expect(201);

      const staffUnreadRes = await request(server())
        .get('/api/v1/conversations/unread-count')
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .expect(200);
      expect(staffUnreadRes.body.data.count).toEqual(0);
    });

    it('reuses an existing agency conversation for the same traveler instead of duplicating it', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice9@e2e.test', 'Alice');
      const agency = await registerAndVerifyAgency(server, 'agency9@e2e.test', 'Wanderlust Co.');

      const firstRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'agency', agencyId: agency.agencyId })
        .expect(201);
      const secondRes = await request(server())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ type: 'agency', agencyId: agency.agencyId })
        .expect(201);

      expect(secondRes.body.data.id).toEqual(firstRes.body.data.id);
    });
  });
});
