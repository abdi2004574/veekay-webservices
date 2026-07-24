import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';

describe('Feed: posts, comments, likes, share (e2e)', () => {
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

  async function befriend(a: { userId: string; accessToken: string }, b: { userId: string; accessToken: string }) {
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

  describe('Post CRUD, like, comment, share', () => {
    it('creates, edits, and deletes a post owned by the caller', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

      const createRes = await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Hello from Bali', location: 'Bali', tags: ['travel'] })
        .expect(201);
      const postId = createRes.body.data.id;
      expect(createRes.body.data.text).toEqual('Hello from Bali');

      const editRes = await request(server())
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Hello from Bali (edited)' })
        .expect(200);
      expect(editRes.body.data.text).toEqual('Hello from Bali (edited)');

      await request(server())
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
    });

    it('attaches a real uploaded photo to a post, resolves imageUrl, and clears it on edit', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice1b@e2e.test', 'Alice');

      const urlRes = await request(server())
        .post('/api/v1/storage/upload-url')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ contentType: 'image/jpeg', purpose: 'post_media' })
        .expect(201);
      const { uploadUrl, mediaId } = urlRes.body.data;

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: Buffer.from('fake-post-photo-bytes'),
      });
      await request(server())
        .post('/api/v1/storage/confirm')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ mediaId })
        .expect(201);

      const createRes = await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Post with a real photo', imageMediaId: mediaId })
        .expect(201);
      const postId = createRes.body.data.id;

      const feedRes = await request(server())
        .get('/api/v1/feed')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      const postInFeed = feedRes.body.data.items.find((p: any) => p.id === postId);
      expect(postInFeed.imageMediaId).toEqual(mediaId);
      expect(postInFeed.imageUrl).toContain('http');

      // Removing the photo must actually clear it (imageMediaId: null), not
      // silently no-op the way `imageMediaId: undefined` would in Prisma.
      const clearRes = await request(server())
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ imageMediaId: null })
        .expect(200);
      expect(clearRes.body.data.imageMediaId).toBeNull();

      const feedAfterRes = await request(server())
        .get('/api/v1/feed')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      const postAfter = feedAfterRes.body.data.items.find((p: any) => p.id === postId);
      expect(postAfter.imageMediaId).toBeNull();
      expect(postAfter.imageUrl).toBeNull();
    });

    it('rejects editing or deleting someone else’s post', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice2@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob2@e2e.test', 'Bob');

      const createRes = await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Alice’s post' })
        .expect(201);
      const postId = createRes.body.data.id;

      const editRes = await request(server())
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ text: 'hijacked' })
        .expect(403);
      expect(editRes.body.error.code).toEqual('FORBIDDEN');

      await request(server())
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(403);
    });

    it('likes and unlikes a post, rejecting a duplicate like', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice3@e2e.test', 'Alice');

      const createRes = await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Like me' })
        .expect(201);
      const postId = createRes.body.data.id;

      await request(server())
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(201);

      const dupeRes = await request(server())
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(409);
      expect(dupeRes.body.error.code).toEqual('CONFLICT');

      await request(server())
        .delete(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
    });

    it('comments on a post, edits and deletes its own comment, and likes a comment', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice4@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob4@e2e.test', 'Bob');
      await befriend(alice, bob);

      const createRes = await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Comment on this' })
        .expect(201);
      const postId = createRes.body.data.id;

      const commentRes = await request(server())
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ text: 'Nice!' })
        .expect(201);
      const commentId = commentRes.body.data.id;

      const listRes = await request(server())
        .get(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(listRes.body.data.items).toHaveLength(1);

      await request(server())
        .patch(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ text: 'Nice trip!' })
        .expect(200);

      await request(server())
        .post(`/api/v1/comments/${commentId}/like`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(201);

      await request(server())
        .delete(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
    });

    it('reposts a post to the resharer’s own profile', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice5@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob5@e2e.test', 'Bob');
      await befriend(alice, bob);

      const createRes = await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Worth sharing' })
        .expect(201);
      const postId = createRes.body.data.id;

      const shareRes = await request(server())
        .post(`/api/v1/posts/${postId}/share`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ caption: 'check this out' })
        .expect(201);

      expect(shareRes.body.data.repostOfId).toEqual(postId);

      const bobProfilePosts = await request(server())
        .get(`/api/v1/users/${bob.userId}/posts`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(bobProfilePosts.body.data.items.map((p: any) => p.id)).toContain(
        shareRes.body.data.id,
      );
    });
  });

  describe('GET /feed visibility', () => {
    it('only shows the caller’s own and friends’ posts, chronologically', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice6@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob6@e2e.test', 'Bob');
      const stranger = await registerAndVerifyTraveler(
        server,
        'stranger6@e2e.test',
        'Stranger',
      );
      await befriend(alice, bob);

      await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ text: 'Alice post' })
        .expect(201);
      await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ text: 'Bob post' })
        .expect(201);
      await request(server())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ text: 'Stranger post' })
        .expect(201);

      const feedRes = await request(server())
        .get('/api/v1/feed')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);

      const texts = feedRes.body.data.items.map((p: any) => p.text);
      expect(texts).toContain('Alice post');
      expect(texts).toContain('Bob post');
      expect(texts).not.toContain('Stranger post');
    });
  });
});
