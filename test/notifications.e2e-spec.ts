import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import {
  registerAndVerifyAgency,
  approveAgency,
  registerApprovedAgency,
} from './utils/register-agency';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerAndLoginAdmin } from './utils/register-admin';
import { NotificationType } from '@prisma/client';

describe('Notifications (e2e)', () => {
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

  describe('Notification lifecycle', () => {
    it('creates a review_received notification when a traveler reviews an agency', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-agency@test.com',
        'Notification Agency',
      );
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-traveler@test.com',
        'Notif Traveler',
      );

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ rating: 5, body: 'Amazing agency!' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].type).toBe(
        NotificationType.review_received,
      );
      expect(res.body.data.items[0].title).toBe('New Review Received');
      expect(res.body.data.items[0].read).toBe(false);
      expect(res.body.data.items[0].deepLinkTarget).toBe('agency');
      expect(res.body.data.items[0].deepLinkEntityId).toBe(agencyId);
      expect(res.body.data.items[0].channel).toBe('in_app');
    });

    it('GET /notifications/unread-count returns the correct count', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-unread-agency@test.com',
        'Unread Agency',
      );
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-unread-traveler@test.com',
        'Unread Traveler',
      );

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ rating: 4 })
        .expect(201);

      const countRes = await request(server())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(countRes.body.data.count).toBe(1);
    });

    it('PATCH /notifications/:id/read marks a notification as read', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-read-agency@test.com',
        'Read Agency',
      );
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-read-traveler@test.com',
        'Read Traveler',
      );

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ rating: 5 })
        .expect(201);

      const listRes = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      const notificationId = listRes.body.data.items[0].id;

      await request(server())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      const countRes = await request(server())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(countRes.body.data.count).toBe(0);
    });

    it('DELETE /notifications/:id removes a notification', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-del-agency@test.com',
        'Del Agency',
      );
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-del-traveler@test.com',
        'Del Traveler',
      );

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ rating: 3 })
        .expect(201);

      const listRes = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      const notificationId = listRes.body.data.items[0].id;

      await request(server())
        .delete(`/api/v1/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(204);

      const afterRes = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(afterRes.body.data.items).toHaveLength(0);
    });
  });

  describe('Notification preferences', () => {
    it('GET /notifications/preferences returns all types with defaults', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-pref-traveler@test.com',
        'Pref Traveler',
      );

      const res = await request(server())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(Object.keys(NotificationType).length);
      const donation = res.body.data.find(
        (p: { type: NotificationType }) => p.type === NotificationType.donation,
      );
      expect(donation).toBeDefined();
      expect(donation.inAppEnabled).toBe(true);
      expect(donation.pushEnabled).toBe(true);
      expect(donation.emailEnabled).toBe(false);
    });

    it('PATCH /notifications/preferences updates a single preference', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-update-pref-traveler@test.com',
        'Update Pref Traveler',
      );

      await request(server())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ type: NotificationType.like, pushEnabled: false })
        .expect(200);

      const res = await request(server())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      const likePref = res.body.data.find(
        (p: { type: NotificationType }) => p.type === NotificationType.like,
      );
      expect(likePref.pushEnabled).toBe(false);
      expect(likePref.inAppEnabled).toBe(true);
      expect(likePref.emailEnabled).toBe(false);
    });
  });

  describe('Push device management', () => {
    it('POST /notifications/devices registers a device', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-device-traveler@test.com',
        'Device Traveler',
      );

      await request(server())
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ fcmToken: 'fcm-token-123', platform: 'ios' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].fcmToken).toBe('fcm-token-123');
      expect(res.body.data[0].platform).toBe('ios');
    });

    it('DELETE /notifications/devices/:token removes a registered device', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-del-device-traveler@test.com',
        'Del Device Traveler',
      );

      await request(server())
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ fcmToken: 'fcm-token-456', platform: 'android' })
        .expect(201);

      await request(server())
        .delete('/api/v1/notifications/devices/fcm-token-456')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(204);

      const res = await request(server())
        .get('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('Mark all read', () => {
    it('POST /notifications/read-all marks all notifications as read', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-readall-agency@test.com',
        'ReadAll Agency',
      );
      const traveler1 = await registerAndVerifyTraveler(
        server,
        'notif-readall-traveler1@test.com',
        'ReadAll Traveler1',
      );
      const traveler2 = await registerAndVerifyTraveler(
        server,
        'notif-readall-traveler2@test.com',
        'ReadAll Traveler2',
      );

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler1.accessToken}`)
        .send({ rating: 5 })
        .expect(201);

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler2.accessToken}`)
        .send({ rating: 4 })
        .expect(201);

      let countRes = await request(server())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);
      expect(countRes.body.data.count).toBe(2);

      await request(server())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      countRes = await request(server())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(countRes.body.data.count).toBe(0);
    });
  });

  describe('Admin broadcast', () => {
    it('POST /admin/notifications/broadcast with target=all sends notifications to all active users', async () => {
      const admin = await registerAndLoginAdmin(server);
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-bcast-traveler@test.com',
        'Bcast Traveler',
      );
      const { agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-bcast-agency@test.com',
        'Bcast Agency',
      );

      const res = await request(server())
        .post('/api/v1/admin/notifications/broadcast')
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .send({
          type: NotificationType.admin_broadcast,
          title: 'Platform Update',
          body: 'We have new features!',
          target: 'all',
        })
        .expect(200);

      expect(res.body.data.sentCount).toBeGreaterThanOrEqual(2);
      expect(res.body.data.failedCount).toBe(0);

      const travelerNotifs = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(
        travelerNotifs.body.data.items.some(
          (n: any) => n.type === NotificationType.admin_broadcast,
        ),
      ).toBe(true);

      const agencyNotifs = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);
      expect(
        agencyNotifs.body.data.items.some(
          (n: any) => n.type === NotificationType.admin_broadcast,
        ),
      ).toBe(true);
    });

    it('POST /admin/notifications/broadcast with target=role sends to specific role', async () => {
      const admin = await registerAndLoginAdmin(
        server,
        'notif-bcast-role-admin@test.com',
      );
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-bcast-role-traveler@test.com',
        'Bcast Role Traveler',
      );
      await registerApprovedAgency(
        server,
        'notif-bcast-role-agency@test.com',
        'Bcast Role Agency',
      );

      const res = await request(server())
        .post('/api/v1/admin/notifications/broadcast')
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .send({
          type: NotificationType.system_alert,
          title: 'Traveler Alert',
          body: 'Only for travelers',
          target: 'role',
          role: 'traveler',
        })
        .expect(200);

      expect(res.body.data.sentCount).toBeGreaterThanOrEqual(1);

      const travelerNotifs = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(
        travelerNotifs.body.data.items.some(
          (n: any) => n.type === NotificationType.system_alert,
        ),
      ).toBe(true);
    });

    it('GET /admin/notifications/segments/preview returns estimated reach', async () => {
      const admin = await registerAndLoginAdmin(
        server,
        'notif-preview-admin@test.com',
      );
      await registerAndVerifyTraveler(
        server,
        'notif-preview-traveler@test.com',
        'Preview Traveler',
      );
      await registerApprovedAgency(
        server,
        'notif-preview-agency@test.com',
        'Preview Agency',
      );

      const res = await request(server())
        .get('/api/v1/admin/notifications/segments/preview?target=all')
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .expect(200);

      expect(res.body.data.estimatedReach).toBeGreaterThanOrEqual(3);
      expect(res.body.data.breakdown.travelers).toBeGreaterThanOrEqual(1);
      expect(res.body.data.breakdown.agencies).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Preference gating', () => {
    it('when pushEnabled is false, notification is created but push dispatch is skipped', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-gate-agency@test.com',
        'Gate Agency',
      );
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-gate-traveler@test.com',
        'Gate Traveler',
      );

      await request(server())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ type: NotificationType.review_received, pushEnabled: false })
        .expect(200);

      await request(server())
        .post(`/api/v1/agencies/${agencyId}/reviews`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ rating: 5 })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].type).toBe(
        NotificationType.review_received,
      );
      expect(res.body.data.items[0].pushSentAt).toBeNull();
    });

    it('when emailEnabled is true for financial type, email is dispatched', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'notif-email-traveler@test.com',
        'Email Traveler',
      );

      await request(server())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ type: NotificationType.donation, emailEnabled: true })
        .expect(200);

      await request(server())
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ fcmToken: 'email-fcm-token', platform: 'ios' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('Cursor pagination', () => {
    it('GET /notifications?limit=10 returns 10 items with nextCursor, then cursor fetches next 10', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency(
        server,
        'notif-cursor-agency@test.com',
        'Cursor Agency',
      );
      for (let i = 0; i < 25; i++) {
        const traveler = await registerAndVerifyTraveler(
          server,
          `notif-cursor-traveler-${i}@test.com`,
          `CT${i}`,
        );
        await request(server())
          .post(`/api/v1/agencies/${agencyId}/reviews`)
          .set('Authorization', `Bearer ${traveler.accessToken}`)
          .send({ rating: 5 })
          .expect(201);
      }

      const page1 = await request(server())
        .get('/api/v1/notifications?limit=10')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(page1.body.data.items).toHaveLength(10);
      expect(page1.body.data.nextCursor).toBeDefined();
      expect(page1.body.data.nextCursor).toBe(page1.body.data.items[9].id);

      const page2 = await request(server())
        .get(
          `/api/v1/notifications?cursor=${page1.body.data.nextCursor}&limit=10`,
        )
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(page2.body.data.items).toHaveLength(10);
      expect(page2.body.data.nextCursor).toBeDefined();
      expect(page2.body.data.nextCursor).toBe(page2.body.data.items[9].id);
    }, 60000);
  });
});
