import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { testPrisma } from './utils/reset-db';

describe('Campaigns (e2e)', () => {
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

  async function uploadPhoto(accessToken: string): Promise<string> {
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

  const basePayload = {
    title: 'My Dream Trip to Greece',
    destination: 'Santorini, Greece',
    goalAmount: 5000,
    tripStartDate: '2026-08-15',
    privacy: 'public',
    giftMode: false,
  };

  it('creates a campaign with a real uploaded photo and resolves its view url', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice1@e2e.test',
      'Alice',
    );
    const mediaId = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);

    expect(createRes.body.data.photos).toHaveLength(1);
    expect(createRes.body.data.photos[0].url).toContain('http');
    expect(createRes.body.data.contributorsCount).toEqual(0);
    expect(createRes.body.data.viewsCount).toEqual(0);
    expect(createRes.body.data.status).toEqual('active');
  });

  it('rejects an end date before the start date', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice2@e2e.test',
      'Alice',
    );
    const mediaId = await uploadPhoto(alice.accessToken);

    const res = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        ...basePayload,
        tripEndDate: '2026-08-01',
        photoMediaIds: [mediaId],
      })
      .expect(400);
    expect(res.body.error.code).toEqual('VALIDATION_ERROR');
  });

  it('rejects more than 5 photos', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice3@e2e.test',
      'Alice',
    );

    await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        ...basePayload,
        photoMediaIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
      })
      .expect(400);
  });

  it('lists my own campaigns', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice4@e2e.test',
      'Alice',
    );
    const mediaId = await uploadPhoto(alice.accessToken);

    await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);

    const res = await request(server())
      .get('/api/v1/campaigns/mine')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toEqual('My Dream Trip to Greece');
  });

  it('hides a private campaign from a non-creator but shows it to the creator', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice5@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob5@e2e.test', 'Bob');
    const mediaId = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, privacy: 'private', photoMediaIds: [mediaId] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    await request(server())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(404);

    const ownerRes = await request(server())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(ownerRes.body.data.isCreator).toBe(true);
  });

  it('increments the view count only for non-creator views', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice6@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob6@e2e.test', 'Bob');
    const mediaId = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    await request(server())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    await request(server())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);

    const res = await request(server())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(res.body.data.viewsCount).toEqual(2);
  });

  it('rejects editing/deleting someone else\'s campaign, and lets the owner edit and delete', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice7@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob7@e2e.test', 'Bob');
    const mediaId = await uploadPhoto(alice.accessToken);
    const mediaId2 = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    await request(server())
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ title: 'Hijacked' })
      .expect(403);
    await request(server())
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);

    const updateRes = await request(server())
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ title: 'Updated Title', photoMediaIds: [mediaId2] })
      .expect(200);
    expect(updateRes.body.data.title).toEqual('Updated Title');
    expect(updateRes.body.data.photos).toHaveLength(1);
    expect(updateRes.body.data.photos[0].mediaId).toEqual(mediaId2);

    await request(server())
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    await request(server())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(404);
  });

  it('top-contributors is always empty � no Donation model exists yet', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice8@e2e.test',
      'Alice',
    );
    const mediaId = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    const res = await request(server())
      .get(`/api/v1/campaigns/${campaignId}/top-contributors`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('removes old photo MinIO objects and MediaAsset rows on update', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice-cleanup@e2e.test',
      'Alice',
    );
    const mediaId1 = await uploadPhoto(alice.accessToken);
    const mediaId2 = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId1] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    await request(server())
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ photoMediaIds: [mediaId2] })
      .expect(200);

    const media1 = await testPrisma.mediaAsset.findUnique({ where: { id: mediaId1 } });
    expect(media1?.status).toEqual('deleted');

    const media2 = await testPrisma.mediaAsset.findUnique({ where: { id: mediaId2 } });
    expect(media2?.status).toEqual('uploaded');
  });

  it('cleans up photo MinIO objects and MediaAsset rows on campaign delete', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice-cleanup-del@e2e.test',
      'Alice',
    );
    const mediaId = await uploadPhoto(alice.accessToken);

    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    await request(server())
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const media = await testPrisma.mediaAsset.findUnique({ where: { id: mediaId } });
    expect(media?.status).toEqual('deleted');
  });

  it('allows removing all photos via empty photoMediaIds on update', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice-empty@e2e.test',
      'Alice',
    );
    const mediaId = await uploadPhoto(alice.accessToken);
    const createRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ ...basePayload, photoMediaIds: [mediaId] })
      .expect(201);
    const campaignId = createRes.body.data.id;

    await request(server())
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ photoMediaIds: [] })
      .expect(200);
  });

  describe('public browse (GET /campaigns)', () => {
    it('lists only public campaigns, excluding private ones from anyone but their creator', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice9@e2e.test',
        'Alice',
      );
      const bob = await registerAndVerifyTraveler(
        server,
        'bob9@e2e.test',
        'Bob',
      );
      const mediaId = await uploadPhoto(alice.accessToken);

      await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          ...basePayload,
          title: 'Public Trip',
          privacy: 'public',
          photoMediaIds: [mediaId],
        })
        .expect(201);
      await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          ...basePayload,
          title: 'Private Trip',
          privacy: 'private',
          photoMediaIds: [mediaId],
        })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/campaigns')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
      const titles = res.body.data.items.map((c: any) => c.title);
      expect(titles).toContain('Public Trip');
      expect(titles).not.toContain('Private Trip');
    });

    it('filters by creatorId, and by title/destination search text', async () => {
      const alice = await registerAndVerifyTraveler(
        server,
        'alice10@e2e.test',
        'Alice',
      );
      const bob = await registerAndVerifyTraveler(
        server,
        'bob10@e2e.test',
        'Bob',
      );
      const aliceMedia = await uploadPhoto(alice.accessToken);
      const bobMedia = await uploadPhoto(bob.accessToken);

      await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          ...basePayload,
          title: 'Santorini Dream',
          destination: 'Santorini, Greece',
          photoMediaIds: [aliceMedia],
        })
        .expect(201);
      await request(server())
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .send({
          ...basePayload,
          title: 'Bali Adventure',
          destination: 'Ubud, Bali',
          photoMediaIds: [bobMedia],
        })
        .expect(201);

      const byCreatorRes = await request(server())
        .get(`/api/v1/campaigns?creatorId=${alice.userId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);
      expect(byCreatorRes.body.data.items.map((c: any) => c.title)).toEqual([
        'Santorini Dream',
      ]);

      const bySearchRes = await request(server())
        .get('/api/v1/campaigns?search=bali')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);
      expect(bySearchRes.body.data.items.map((c: any) => c.title)).toEqual([
        'Bali Adventure',
      ]);
    });
  });
});


