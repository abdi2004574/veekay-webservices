import { INestApplication } from '@nestjs/common';
import { AgencyDocumentType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerAndVerifyAgency } from './utils/register-agency';

describe('Storage: presigned upload/confirm/view against real MinIO (e2e)', () => {
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

  async function uploadAndConfirm(
    accessToken: string,
    purpose: string,
    contentType = 'image/jpeg',
  ): Promise<string> {
    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contentType, purpose })
      .expect(201);
    const { uploadUrl, mediaId } = urlRes.body.data;
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: Buffer.from('test-bytes'),
    });
    await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mediaId })
      .expect(201);
    return mediaId;
  }

  it('rejects a disallowed content type for the purpose', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice@e2e.test',
      'Alice',
    );

    const res = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'application/zip', purpose: 'profile_photo' })
      .expect(400);
    expect(res.body.error.code).toEqual('VALIDATION_ERROR');
  });

  it('uploads a real file to MinIO, confirms it, and resolves a working view URL', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice2@e2e.test',
      'Alice',
    );

    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'image/jpeg', purpose: 'post_media' })
      .expect(201);

    const { uploadUrl, mediaId, key } = urlRes.body.data;
    expect(uploadUrl).toContain('http');
    expect(key).toMatch(/^post_media\/.+\.jpg$/);

    const fileBytes = Buffer.from('fake-jpeg-bytes-for-e2e-test');
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: fileBytes,
    });
    expect(putRes.ok).toBe(true);

    const confirmRes = await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ mediaId })
      .expect(201);
    expect(confirmRes.body.data.status).toEqual('uploaded');
    expect(confirmRes.body.data.sizeBytes).toEqual(fileBytes.length);

    // Alice must create a post referencing the media so the view-url access check resolves a parent entity
    const createPostRes = await request(server())
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ text: 'Test post', imageMediaId: mediaId })
      .expect(201);

    const viewRes = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=post&entityId=${createPostRes.body.data.id}`,
      )
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(viewRes.body.data.url).toContain('http');

    const downloaded = await fetch(viewRes.body.data.url);
    expect(downloaded.ok).toBe(true);
    const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
    expect(downloadedBytes.equals(fileBytes)).toBe(true);
  });

  it('rejects confirming before the file is actually uploaded', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice3@e2e.test',
      'Alice',
    );

    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'image/jpeg', purpose: 'post_media' })
      .expect(201);

    const res = await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ mediaId: urlRes.body.data.mediaId })
      .expect(404);
    expect(res.body.error.code).toEqual('NOT_FOUND');
  });

  it('rejects confirming a media asset owned by someone else', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice4@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob4@e2e.test', 'Bob');

    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'image/jpeg', purpose: 'post_media' })
      .expect(201);

    const res = await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ mediaId: urlRes.body.data.mediaId })
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('rejects a non-owner viewing an agency document', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice5@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob5@e2e.test', 'Bob');

    const urlRes = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'application/pdf', purpose: 'agency_document' })
      .expect(201);
    const { uploadUrl, mediaId } = urlRes.body.data;

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: Buffer.from('fake-pdf-bytes'),
    });
    await request(server())
      .post('/api/v1/storage/confirm')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ mediaId })
      .expect(201);

    // Register an agency so we have a real AgencyDocument parent row to link the media to
    const agency = await registerAndVerifyAgency(
      server,
      'agency-doc@e2e.test',
      'Doc Agency',
    );

    // Link Alice's uploaded media to the agency via a real AgencyDocument record
    await testPrisma.agencyDocument.create({
      data: {
        agencyId: agency.agencyId,
        type: AgencyDocumentType.business_license,
        mediaId,
      },
    });

    const res = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=agency_document&entityId=${agency.agencyId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('campaign_photo: private campaign photo denied to non-creator', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice6@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob6@e2e.test', 'Bob');

    const mediaId = await uploadAndConfirm(alice.accessToken, 'campaign_photo');

    const campaignRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        title: 'Private Trip',
        destination: 'Paris, France',
        goalAmount: 3000,
        tripStartDate: '2026-09-01',
        privacy: 'private',
        giftMode: false,
        photoMediaIds: [mediaId],
      })
      .expect(201);
    const campaignId = campaignRes.body.data.id;

    const res = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=campaign&entityId=${campaignId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('campaign_photo: public campaign photo allowed to anyone', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice7@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob7@e2e.test', 'Bob');

    const mediaId = await uploadAndConfirm(alice.accessToken, 'campaign_photo');

    const campaignRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        title: 'Public Trip',
        destination: 'Tokyo, Japan',
        goalAmount: 4000,
        tripStartDate: '2026-10-01',
        privacy: 'public',
        giftMode: false,
        photoMediaIds: [mediaId],
      })
      .expect(201);
    const campaignId = campaignRes.body.data.id;

    const viewRes = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=campaign&entityId=${campaignId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(viewRes.body.data.url).toContain('http');
  });

  it('post_media: denied to non-friend', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice8@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob8@e2e.test', 'Bob');

    const mediaId = await uploadAndConfirm(alice.accessToken, 'post_media');

    const postRes = await request(server())
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ text: 'Hello world', imageMediaId: mediaId })
      .expect(201);
    const postId = postRes.body.data.id;

    const res = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=post&entityId=${postId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('story_media: denied to non-friend', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice9@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(server, 'bob9@e2e.test', 'Bob');

    const mediaId = await uploadAndConfirm(alice.accessToken, 'story_media');

    const storyRes = await request(server())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ imageMediaId: mediaId })
      .expect(201);
    const storyId = storyRes.body.data.id;

    const res = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=story&entityId=${storyId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('profile_photo: private profile denied to others', async () => {
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

    const mediaId = await uploadAndConfirm(alice.accessToken, 'profile_photo');

    await request(server())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ photoMediaId: mediaId })
      .expect(200);

    await request(server())
      .patch('/api/v1/me/privacy-settings')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ profileVisibility: 'private' })
      .expect(200);

    const res = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=profile&entityId=${alice.userId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('profile_photo: public profile allowed to anyone', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice11@e2e.test',
      'Alice',
    );
    const bob = await registerAndVerifyTraveler(
      server,
      'bob11@e2e.test',
      'Bob',
    );

    const mediaId = await uploadAndConfirm(alice.accessToken, 'profile_photo');

    await request(server())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ photoMediaId: mediaId })
      .expect(200);

    await request(server())
      .patch('/api/v1/me/privacy-settings')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ profileVisibility: 'public' })
      .expect(200);

    const viewRes = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=profile&entityId=${alice.userId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(viewRes.body.data.url).toContain('http');
  });

  it('agency_logo: unapproved agency denied', async () => {
    const agency = await registerAndVerifyAgency(
      server,
      'agency12@e2e.test',
      'Unapproved Agency',
    );
    const bob = await registerAndVerifyTraveler(
      server,
      'bob12@e2e.test',
      'Bob',
    );

    const mediaId = await uploadAndConfirm(agency.accessToken, 'agency_logo');

    await testPrisma.agency.update({
      where: { id: agency.agencyId },
      data: { logoMediaId: mediaId },
    });

    const res = await request(server())
      .get(
        `/api/v1/storage/${mediaId}/view-url?entityType=agency&entityId=${agency.agencyId}`,
      )
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });

  it('missing entityType/entityId query params rejected', async () => {
    const alice = await registerAndVerifyTraveler(
      server,
      'alice13@e2e.test',
      'Alice',
    );

    const mediaId = await uploadAndConfirm(alice.accessToken, 'post_media');

    const res = await request(server())
      .get(`/api/v1/storage/${mediaId}/view-url`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(400);
    expect(res.body.error.code).toEqual('VALIDATION_ERROR');
  });
});
