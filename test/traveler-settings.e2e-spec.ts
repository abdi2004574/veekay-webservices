import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';

describe('Traveler Settings (e2e)', () => {
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

  describe('PATCH /me/profile', () => {
    it('updates the fields sent and persists them', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

      const updateRes = await request(server())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          bio: 'Wanderer at heart.',
          phone: '+1 555 0100',
          location: 'Lisbon, Portugal',
          gender: 'female',
          dateOfBirth: '1995-04-12',
          destinationTypes: ['beach', 'city'],
          travelStyles: ['solo'],
          username: 'alicetraveler',
          displayName: 'Alice T.',
        })
        .expect(200);

      expect(updateRes.body.data.bio).toEqual('Wanderer at heart.');
      expect(updateRes.body.data.username).toEqual('alicetraveler');

      const meRes = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);

      expect(meRes.body.data.phone).toEqual('+1 555 0100');
      expect(meRes.body.data.location).toEqual('Lisbon, Portugal');
      expect(meRes.body.data.displayName).toEqual('Alice T.');
      expect(meRes.body.data.destinationTypes.sort()).toEqual(['beach', 'city']);
      expect(meRes.body.data.travelStyles).toEqual(['solo']);
    });

    it('rejects a username already taken by someone else', async () => {
      await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob@e2e.test', 'Bob');

      await request(server())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ username: 'alice' })
        .expect(409);
    });
  });

  describe('notification preferences', () => {
    it('defaults to all-enabled and round-trips a partial update', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

      const defaultsRes = await request(server())
        .get('/api/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(defaultsRes.body.data).toEqual({
        donationAlerts: true,
        campaignUpdates: true,
        agencyMessages: true,
      });

      await request(server())
        .patch('/api/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ donationAlerts: false })
        .expect(200);

      const updatedRes = await request(server())
        .get('/api/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(updatedRes.body.data).toEqual({
        donationAlerts: false,
        campaignUpdates: true,
        agencyMessages: true,
      });
    });
  });

  describe('privacy settings and profile-visibility enforcement', () => {
    it('a private profile is hidden from strangers but always visible to its owner', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob@e2e.test', 'Bob');

      await request(server())
        .patch('/api/v1/me/privacy-settings')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ profileVisibility: 'private' })
        .expect(200);

      await request(server())
        .get(`/api/v1/users/${alice.userId}/profile`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(404);

      await request(server())
        .get(`/api/v1/users/${alice.userId}/profile`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
    });

    it('a friends-only profile is hidden from strangers, visible once friends', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');
      const bob = await registerAndVerifyTraveler(server, 'bob@e2e.test', 'Bob');

      await request(server())
        .patch('/api/v1/me/privacy-settings')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ profileVisibility: 'friends' })
        .expect(200);

      await request(server())
        .get(`/api/v1/users/${alice.userId}/profile`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(404);

      const sendRes = await request(server())
        .post('/api/v1/friend-requests')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({ addresseeId: alice.userId })
        .expect(201);

      await request(server())
        .post(`/api/v1/friend-requests/${sendRes.body.data.id}/accept`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(201);

      await request(server())
        .get(`/api/v1/users/${alice.userId}/profile`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
    });
  });

  describe('change-password and logout-all (regression — no behavior change, still reusable from Settings)', () => {
    it('changes the password and logs in with the new one, rejecting the old', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

      await request(server())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ currentPassword: 'StrongPassword123!', newPassword: 'NewStrongPassword456!' })
        .expect(201);

      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'alice@e2e.test', password: 'StrongPassword123!' })
        .expect(401);

      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'alice@e2e.test', password: 'NewStrongPassword456!' })
        .expect(201);
    });

    it('logout-all revokes the existing refresh token', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

      await request(server())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(204);

      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: alice.refreshToken })
        .expect(401);
    });
  });

  describe('DELETE /me (soft-delete)', () => {
    it('deactivates the account, blocking further requests and future logins', async () => {
      const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

      await request(server())
        .delete('/api/v1/me')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(204);

      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(403);

      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'alice@e2e.test', password: 'StrongPassword123!' })
        .expect(403);
    });
  });
});
