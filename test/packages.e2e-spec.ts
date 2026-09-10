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
} from './utils/register-agency';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { testPrisma } from './utils/reset-db';

describe('Packages (e2e)', () => {
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

  async function uploadVisual(accessToken: string): Promise<string> {
    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contentType: 'image/jpeg', purpose: 'package_visual' })
      .expect(201);
    const { uploadUrl, mediaId } = urlRes.body.data;

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from('fake-package-visual-bytes'),
    });
    await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mediaId })
      .expect(201);

    return mediaId;
  }

  async function uploadCampaignPhoto(accessToken: string): Promise<string> {
    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contentType: 'image/jpeg', purpose: 'campaign_photo' })
      .expect(201);
    const { uploadUrl, mediaId } = urlRes.body.data;

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from('fake-campaign-photo-bytes'),
    });
    await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mediaId })
      .expect(201);

    return mediaId;
  }

  describe('Agency CRUD', () => {
    it('creates a package with media and resolves view urls', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency1@e2e.test',
        'Test Agency',
      );
      await approveAgency(agencyId);
      const mediaId = await uploadVisual(accessToken);

      const res = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Bali Beach Getaway',
          description: 'Relaxing 5-day escape.',
          basePrice: 2500,
          currency: 'USD',
          destinationType: 'beach',
          season: 'summer',
          theme: 'family',
          itinerary: 'Day 1: Arrival.',
          mediaMediaIds: [mediaId],
        })
        .expect(201);

      expect(res.body.data.title).toBe('Bali Beach Getaway');
      expect(res.body.data.basePrice).toBe(2500);
      expect(res.body.data.media).toHaveLength(1);
      expect(res.body.data.media[0].url).toContain('http');
      expect(res.body.data.status).toBe('active');
    });

    it('lists own packages (all statuses)', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency2@e2e.test',
        'Test Agency 2',
      );
      await approveAgency(agencyId);

      await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Pkg 1', basePrice: 100, currency: 'USD' })
        .expect(201);

      await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Pkg 2',
          basePrice: 200,
          status: 'inactive',
          currency: 'USD',
        })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/packages/mine')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.map((p: any) => p.title).sort()).toEqual([
        'Pkg 1',
        'Pkg 2',
      ]);
    });

    it('rejects a traveler creating a package', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'traveler1@e2e.test',
        'Traveler',
      );

      await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ title: 'Hacked', basePrice: 1, currency: 'USD' })
        .expect(403);
    });

    it('updates a package and replaces media', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency3@e2e.test',
        'Test Agency 3',
      );
      await approveAgency(agencyId);

      const createRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Original', basePrice: 100, currency: 'USD' })
        .expect(201);

      const pkgId = createRes.body.data.id;
      const newMedia = await uploadVisual(accessToken);

      const updateRes = await request(server())
        .patch(`/api/v1/packages/${pkgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated', mediaMediaIds: [newMedia] })
        .expect(200);

      expect(updateRes.body.data.title).toBe('Updated');
      expect(updateRes.body.data.media).toHaveLength(1);
      expect(updateRes.body.data.media[0].mediaId).toBe(newMedia);
    });

    it('deletes a package', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency4@e2e.test',
        'Test Agency 4',
      );
      await approveAgency(agencyId);

      const createRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'To Delete', basePrice: 50, currency: 'USD' })
        .expect(201);

      const pkgId = createRes.body.data.id;

      await request(server())
        .delete(`/api/v1/packages/${pkgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(server())
        .get(`/api/v1/packages/${pkgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('rejects creating a package with more than 6 media items', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency-media-max@e2e.test',
        'Test Agency',
      );
      await approveAgency(agencyId);

      const mediaIds = Array.from({ length: 7 }, (_, i) => `m${i + 1}`);

      await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Too Many Media',
          basePrice: 100,
          currency: 'USD',
          mediaMediaIds: mediaIds,
        })
        .expect(400);
    });

    it('rejects updating a package with more than 6 media items', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency-media-max-update@e2e.test',
        'Test Agency',
      );
      await approveAgency(agencyId);

      const createRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Original', basePrice: 100, currency: 'USD' })
        .expect(201);
      const pkgId = createRes.body.data.id;

      const mediaIds = Array.from({ length: 7 }, (_, i) => `m${i + 1}`);

      await request(server())
        .patch(`/api/v1/packages/${pkgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ mediaMediaIds: mediaIds })
        .expect(400);
    });

    it('removes orphaned media when replacing package visuals', async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency-visual-cleanup@e2e.test',
        'Test Agency',
      );
      await approveAgency(agencyId);

      const oldMedia = await uploadVisual(accessToken);
      const newMedia = await uploadVisual(accessToken);

      const createRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Original Visuals',
          basePrice: 100,
          currency: 'USD',
          mediaMediaIds: [oldMedia],
        })
        .expect(201);
      const pkgId = createRes.body.data.id;

      await request(server())
        .patch(`/api/v1/packages/${pkgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ mediaMediaIds: [newMedia] })
        .expect(200);

      const oldAsset = await testPrisma.mediaAsset.findUnique({ where: { id: oldMedia } });
      expect(oldAsset?.status).toEqual('deleted');

      const newAsset = await testPrisma.mediaAsset.findUnique({ where: { id: newMedia } });
      expect(newAsset?.status).toEqual('uploaded');
    });
  });

  describe('Public browse', () => {
    let agencyAccessToken: string;
    let activePkgId: string;
    let inactivePkgId: string;

    beforeEach(async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency5@e2e.test',
        'Browse Agency',
      );
      await approveAgency(agencyId);
      agencyAccessToken = accessToken;

      const activeRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({
          title: 'Active Pkg',
          basePrice: 300,
          currency: 'USD',
          destinationType: 'beach',
          season: 'summer',
          theme: 'family',
        })
        .expect(201);
      activePkgId = activeRes.body.data.id;

      const inactiveRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({
          title: 'Inactive Pkg',
          basePrice: 400,
          status: 'inactive',
          currency: 'USD',
        })
        .expect(201);
      inactivePkgId = inactiveRes.body.data.id;
    });

    it('returns only active packages in public browse', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'traveler2@e2e.test',
        'Traveler',
      );

      const res = await request(server())
        .get('/api/v1/packages')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      const titles = res.body.data.items.map((p: any) => p.title);
      expect(titles).toContain('Active Pkg');
      expect(titles).not.toContain('Inactive Pkg');
    });

    it('filters by destinationType, season, and theme', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'traveler3@e2e.test',
        'Traveler',
      );

      const res = await request(server())
        .get(
          '/api/v1/packages?destinationType=beach&season=summer&theme=family',
        )
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe('Active Pkg');
    });

    it('returns 404 for a non-active package to a non-owner', async () => {
      const traveler = await registerAndVerifyTraveler(
        server,
        'traveler4@e2e.test',
        'Traveler',
      );

      await request(server())
        .get(`/api/v1/packages/${inactivePkgId}`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(404);
    });

    it('lets the owner view their own inactive package', async () => {
      const res = await request(server())
        .get(`/api/v1/packages/${inactivePkgId}`)
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(res.body.data.title).toBe('Inactive Pkg');
    });
  });

  describe('Traveler link/unlink', () => {
    let agencyAccessToken: string;
    let pkgId: string;
    let travelerAccessToken: string;
    let campaignId: string;

    beforeEach(async () => {
      const { agencyId, accessToken } = await registerAndVerifyAgency(
        server,
        'agency6@e2e.test',
        'Link Agency',
      );
      await approveAgency(agencyId);
      agencyAccessToken = accessToken;

      const pkgRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ title: 'Linkable Pkg', basePrice: 500, currency: 'USD' })
        .expect(201);
      pkgId = pkgRes.body.data.id;

      const traveler = await registerAndVerifyTraveler(
        server,
        'traveler5@e2e.test',
        'Traveler',
      );
      travelerAccessToken = traveler.accessToken;

      const photoMediaId = await uploadCampaignPhoto(traveler.accessToken);
      const campaignRes = await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({
          title: 'My Trip',
          destination: 'Paris',
          goalAmount: 1000,
          tripStartDate: '2026-09-01',
          privacy: 'public',
          giftMode: false,
          photoMediaIds: [photoMediaId],
        })
        .expect(201);
      campaignId = campaignRes.body.data.id;
    });

    it("links an active package to a traveler's campaign", async () => {
      await request(server())
        .post(`/api/v1/packages/${pkgId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(200);
    });

    it('rejects linking an inactive package', async () => {
      const inactiveRes = await request(server())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({
          title: 'Inactive Linkable',
          basePrice: 500,
          status: 'inactive',
          currency: 'USD',
        })
        .expect(201);
      const inactiveId = inactiveRes.body.data.id;

      await request(server())
        .post(`/api/v1/packages/${inactiveId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(404);
    });

    it('rejects duplicate links', async () => {
      await request(server())
        .post(`/api/v1/packages/${pkgId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(200);

      await request(server())
        .post(`/api/v1/packages/${pkgId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(409);
    });

    it('unlinks a package from a campaign', async () => {
      await request(server())
        .post(`/api/v1/packages/${pkgId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(200);

      await request(server())
        .delete(`/api/v1/packages/${pkgId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(200);

      await request(server())
        .post(`/api/v1/packages/${pkgId}/campaigns/${campaignId}/link`)
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(200);
    });

    it('rejects linking to a campaign owned by another traveler', async () => {
      const otherTraveler = await registerAndVerifyTraveler(
        server,
        'traveler6@e2e.test',
        'Other',
      );
      const otherPhotoMediaId = await uploadCampaignPhoto(
        otherTraveler.accessToken,
      );
      const otherCampaignRes = await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${otherTraveler.accessToken}`)
        .send({
          title: 'Other Trip',
          destination: 'Tokyo',
          goalAmount: 2000,
          tripStartDate: '2026-10-01',
          privacy: 'public',
          giftMode: false,
          photoMediaIds: [otherPhotoMediaId],
        })
        .expect(201);

      await request(server())
        .post(
          `/api/v1/packages/${pkgId}/campaigns/${otherCampaignRes.body.data.id}/link`,
        )
        .set('Authorization', `Bearer ${travelerAccessToken}`)
        .expect(404);
    });
  });
});
