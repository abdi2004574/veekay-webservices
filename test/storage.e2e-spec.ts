import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';

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

  it('rejects a disallowed content type for the purpose', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice@e2e.test', 'Alice');

    const res = await request(server())
      .post('/api/v1/storage/upload-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'application/zip', purpose: 'profile_photo' })
      .expect(400);
    expect(res.body.error.code).toEqual('VALIDATION_ERROR');
  });

  it('uploads a real file to MinIO, confirms it, and resolves a working view URL', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice2@e2e.test', 'Alice');

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

    const viewRes = await request(server())
      .get(`/api/v1/storage/${mediaId}/view-url`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(viewRes.body.data.url).toContain('http');

    const downloaded = await fetch(viewRes.body.data.url);
    expect(downloaded.ok).toBe(true);
    const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
    expect(downloadedBytes.equals(fileBytes)).toBe(true);
  });

  it('rejects confirming before the file is actually uploaded', async () => {
    const alice = await registerAndVerifyTraveler(server, 'alice3@e2e.test', 'Alice');

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
    const alice = await registerAndVerifyTraveler(server, 'alice4@e2e.test', 'Alice');
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
    const alice = await registerAndVerifyTraveler(server, 'alice5@e2e.test', 'Alice');
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

    const res = await request(server())
      .get(`/api/v1/storage/${mediaId}/view-url`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toEqual('FORBIDDEN');
  });
});
