import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyAgency, approveAgency } from './utils/register-agency';
import { registerAndVerifyTraveler } from './utils/register-traveler';

describe('Trip requests (e2e)', () => {
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

  async function registerApprovedAgencyWithPackage(): Promise<{ agencyAccessToken: string; agencyId: string }> {
    const { agencyId, accessToken } = await registerAndVerifyAgency(
      server,
      'agency-e2e-pkg@test.com',
      'Package Agency',
    );
    await approveAgency(agencyId);

    await request(server())
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Agency Pkg', basePrice: 500, currency: 'USD' })
      .expect(201);

    return { agencyAccessToken: accessToken, agencyId };
  }

  async function registerApprovedAgency(): Promise<{ agencyAccessToken: string; agencyId: string }> {
    const { agencyId, accessToken } = await registerAndVerifyAgency(
      server,
      'agency-e2e@test.com',
      'Test Agency',
    );
    await approveAgency(agencyId);
    return { agencyAccessToken: accessToken, agencyId };
  }

  async function createCampaignForTraveler(travelerAccessToken: string): Promise<string> {
    const photoMediaId = await uploadCampaignPhoto(travelerAccessToken);
    const campaignRes = await request(server())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${travelerAccessToken}`)
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
    return campaignRes.body.data.id;
  }

  describe('Trip request creation', () => {
    it('creates a request as a traveler, returns 201 with status=pending and a conversationId', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-create@test.com', 'Traveler');

      const res = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({
          agencyId,
          message: 'I am interested in your packages.',
        })
        .expect(201);

      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.conversationId).toBeDefined();
    });

    it('the created conversation is of type agency and the auto-posted initial message is in the message history', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-convo@test.com', 'Traveler');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({
          agencyId,
          message: 'Initial inquiry message',
        })
        .expect(201);

      const conversationId = createRes.body.data.conversationId;

      const messagesRes = await request(server())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(messagesRes.body.data.items[0].body).toBe('Initial inquiry message');
    });

    it('rejects a traveler creating a request against a non-approved (pending) agency with 404', async () => {
      const { agencyId } = await registerAndVerifyAgency(server, 'pending-agency@test.com', 'Pending Agency');
      const traveler = await registerAndVerifyTraveler(server, 'traveler-pending@test.com', 'Traveler');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Hi' })
        .expect(404);
    });

    it('rejects when packageId refers to a package owned by another agency (404)', async () => {
      const { agencyId: agencyId1, agencyAccessToken: token1 } = await registerApprovedAgencyWithPackage();
      const { agencyId: agencyId2, agencyAccessToken: token2 } = await registerApprovedAgency();

      const pkgRes = await request(server())
        .get('/api/v1/packages/mine')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      const foreignPkgId = pkgRes.body.data[0].id;

      const traveler = await registerAndVerifyTraveler(server, 'traveler-pkg-other@test.com', 'Traveler');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId: agencyId2, packageId: foreignPkgId, message: 'Hi' })
        .expect(404);
    });

    it('rejects when campaignId refers to a campaign owned by another traveler (404)', async () => {
      const { agencyId } = await registerApprovedAgency();
      const otherTraveler = await registerAndVerifyTraveler(server, 'other-traveler-camp@test.com', 'Other');
      const otherCampaignId = await createCampaignForTraveler(otherTraveler.accessToken);

      const traveler = await registerAndVerifyTraveler(server, 'traveler-camp-other@test.com', 'Traveler');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, campaignId: otherCampaignId, message: 'Hi' })
        .expect(404);
    });

    it('rejects creating a request as an agency user (403)', async () => {
      const { agencyId, agencyAccessToken } = await registerApprovedAgency();

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ agencyId, message: 'Hi' })
        .expect(403);
    });
  });

  describe('List endpoints', () => {
    it('traveler\'s GET /trip-requests/mine returns only their requests', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler1 = await registerAndVerifyTraveler(server, 'traveler-list-1@test.com', 'T1');
      const traveler2 = await registerAndVerifyTraveler(server, 'traveler-list-2@test.com', 'T2');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler1.accessToken}`)
        .send({ agencyId, message: 'Req 1' })
        .expect(201);

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler2.accessToken}`)
        .send({ agencyId, message: 'Req 2' })
        .expect(201);

      const res1 = await request(server())
        .get('/api/v1/trip-requests/mine')
        .set('Authorization', `Bearer ${traveler1.accessToken}`)
        .expect(200);

      const res2 = await request(server())
        .get('/api/v1/trip-requests/mine')
        .set('Authorization', `Bearer ${traveler2.accessToken}`)
        .expect(200);

      expect(res1.body.data).toHaveLength(1);
      expect(res1.body.data[0].message).toBe('Req 1');
      expect(res2.body.data).toHaveLength(1);
      expect(res2.body.data[0].message).toBe('Req 2');
    });

    it('traveler\'s list filters by status', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-list-status@test.com', 'T1');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Pending req' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/trip-requests/mine?status=pending')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('agency\'s GET /trip-requests returns only incoming requests for that agency', async () => {
      const { agencyId: agencyId1 } = await registerApprovedAgency();
      const { agencyId: agencyId2 } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-agency-list@test.com', 'T1');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId: agencyId1, message: 'For agency 1' })
        .expect(201);

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId: agencyId2, message: 'For agency 2' })
        .expect(201);

      const agency1Res = await request(server())
        .get('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${(await registerAndVerifyAgency(server, 'agency-resolver-1@test.com', 'A1')).accessToken}`)
        .expect(200);

      const agency2Res = await request(server())
        .get('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${(await registerAndVerifyAgency(server, 'agency-resolver-2@test.com', 'A2')).accessToken}`)
        .expect(200);

      expect(agency1Res.body.data).toHaveLength(1);
      expect(agency1Res.body.data[0].message).toBe('For agency 1');
      expect(agency2Res.body.data).toHaveLength(1);
      expect(agency2Res.body.data[0].message).toBe('For agency 2');
    });

    it('agency\'s list filters by status', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-agency-list-status@test.com', 'T1');

      await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Pending req' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/trip-requests?status=pending')
        .set('Authorization', `Bearer ${(await registerAndVerifyAgency(server, 'agency-resolver-status@test.com', 'A1')).accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('pending');
    });
  });

  describe('Status transitions', () => {
    it('agency can transition pending -> in_discussion -> confirmed -> completed', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-transitions@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Transition test' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-transitions@test.com', 'Trans Agency');
      await approveAgency(agencyData.agencyId);

      const agencyToken = agencyData.accessToken;

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyToken}`)
        .send({ status: 'in_discussion' })
        .expect(200);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyToken}`)
        .send({ status: 'confirmed' })
        .expect(200);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyToken}`)
        .send({ status: 'completed' })
        .expect(200);
    });

    it('agency can transition pending -> declined', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-decline@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Decline me' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-decline@test.com', 'Decline Agency');
      await approveAgency(agencyData.agencyId);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'declined' })
        .expect(200);
    });

    it('rejected legal transition: trying pending -> confirmed returns 422 BUSINESS_RULE', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-illegal@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Illegal' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-illegal@test.com', 'Illegal Agency');
      await approveAgency(agencyData.agencyId);

      const res = await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'confirmed' })
        .expect(422);

      expect(res.body.error.code).toBe('BUSINESS_RULE');
    });

    it('rejected legal transition: trying declined -> pending returns 422', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-declined-back@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Decline back' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-declined-back@test.com', 'Declined Back Agency');
      await approveAgency(agencyData.agencyId);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'declined' })
        .expect(200);

      const res = await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'pending' })
        .expect(422);

      expect(res.body.error.code).toBe('BUSINESS_RULE');
    });

    it('status update by a different agency returns 404', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-diff-agency@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Diff agency' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const otherAgency = await registerAndVerifyAgency(server, 'other-agency-status@test.com', 'Other Agency');
      await approveAgency(otherAgency.agencyId);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${otherAgency.accessToken}`)
        .send({ status: 'in_discussion' })
        .expect(404);
    });
  });

  describe('Traveler cancel', () => {
    it('traveler cancels a pending request, status becomes cancelled', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-cancel-pending@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Cancel me' })
        .expect(201);

      const requestId = createRes.body.data.id;

      await request(server())
        .post(`/api/v1/trip-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      const detailRes = await request(server())
        .get(`/api/v1/trip-requests/${requestId}`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(detailRes.body.data.status).toBe('cancelled');
    });

    it('traveler cancels an in_discussion request', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-cancel-discussion@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Discussion cancel' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-cancel-discussion@test.com', 'Discussion Agency');
      await approveAgency(agencyData.agencyId);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'in_discussion' })
        .expect(200);

      await request(server())
        .post(`/api/v1/trip-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      const detailRes = await request(server())
        .get(`/api/v1/trip-requests/${requestId}`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(detailRes.body.data.status).toBe('cancelled');
    });

    it('traveler cannot cancel a confirmed request (422)', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-cancel-confirmed@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Confirm cancel' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-cancel-confirmed@test.com', 'Confirm Agency');
      await approveAgency(agencyData.agencyId);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'in_discussion' })
        .expect(200);

      await request(server())
        .patch(`/api/v1/trip-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .send({ status: 'confirmed' })
        .expect(200);

      const res = await request(server())
        .post(`/api/v1/trip-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(422);

      expect(res.body.error.code).toBe('BUSINESS_RULE');
    });

    it('traveler cannot cancel another traveler\'s request (404)', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler1 = await registerAndVerifyTraveler(server, 'traveler-cancel-other-1@test.com', 'T1');
      const traveler2 = await registerAndVerifyTraveler(server, 'traveler-cancel-other-2@test.com', 'T2');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler1.accessToken}`)
        .send({ agencyId, message: 'Other cancel' })
        .expect(201);

      const requestId = createRes.body.data.id;

      await request(server())
        .post(`/api/v1/trip-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${traveler2.accessToken}`)
        .expect(404);
    });
  });

  describe('Smart-reply templates', () => {
    it('agency creates a template and lists it back', async () => {
      const { agencyAccessToken } = await registerApprovedAgency();

      await request(server())
        .post('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ title: 'Greeting', body: 'Hello, how can I help?' })
        .expect(201);

      const listRes = await request(server())
        .get('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].title).toBe('Greeting');
    });

    it('agency updates a template they own', async () => {
      const { agencyAccessToken } = await registerApprovedAgency();

      const createRes = await request(server())
        .post('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ title: 'Original', body: 'Original body' })
        .expect(201);

      const templateId = createRes.body.data.id;

      await request(server())
        .patch(`/api/v1/trip-requests/smart-replies/templates/${templateId}`)
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ title: 'Updated' })
        .expect(200);

      const listRes = await request(server())
        .get('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(listRes.body.data[0].title).toBe('Updated');
      expect(listRes.body.data[0].body).toBe('Original body');
    });

    it('agency cannot update a template owned by another agency (404)', async () => {
      const { agencyAccessToken: token1 } = await registerApprovedAgency();
      const { agencyAccessToken: token2 } = await registerApprovedAgency();

      const createRes = await request(server())
        .post('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${token1}`)
        .send({ title: 'Agency 1 Template', body: 'Body 1' })
        .expect(201);

      const templateId = createRes.body.data.id;

      await request(server())
        .patch(`/api/v1/trip-requests/smart-replies/templates/${templateId}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ title: 'Hacked' })
        .expect(404);
    });

    it('agency deletes their own template; subsequent list returns empty', async () => {
      const { agencyAccessToken } = await registerApprovedAgency();

      const createRes = await request(server())
        .post('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .send({ title: 'To Delete', body: 'Delete me' })
        .expect(201);

      const templateId = createRes.body.data.id;

      await request(server())
        .delete(`/api/v1/trip-requests/smart-replies/templates/${templateId}`)
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      const listRes = await request(server())
        .get('/api/v1/trip-requests/smart-replies/templates')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .expect(200);

      expect(listRes.body.data).toHaveLength(0);
    });
  });

  describe('Detail endpoint', () => {
    it('traveler can fetch their own request', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-detail-own@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Detail test' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const detailRes = await request(server())
        .get(`/api/v1/trip-requests/${requestId}`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(detailRes.body.data.id).toBe(requestId);
    });

    it('traveler cannot fetch a request they don\'t own (404)', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler1 = await registerAndVerifyTraveler(server, 'traveler-detail-1@test.com', 'T1');
      const traveler2 = await registerAndVerifyTraveler(server, 'traveler-detail-2@test.com', 'T2');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler1.accessToken}`)
        .send({ agencyId, message: 'Detail other' })
        .expect(201);

      const requestId = createRes.body.data.id;

      await request(server())
        .get(`/api/v1/trip-requests/${requestId}`)
        .set('Authorization', `Bearer ${traveler2.accessToken}`)
        .expect(404);
    });

    it('agency can fetch their own incoming request', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-detail-agency@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Agency detail' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const agencyData = await registerAndVerifyAgency(server, 'agency-detail-own@test.com', 'Detail Agency');
      await approveAgency(agencyData.agencyId);

      const detailRes = await request(server())
        .get(`/api/v1/trip-requests/${requestId}`)
        .set('Authorization', `Bearer ${agencyData.accessToken}`)
        .expect(200);

      expect(detailRes.body.data.id).toBe(requestId);
    });

    it('agency cannot fetch a request for another agency (404)', async () => {
      const { agencyId } = await registerApprovedAgency();
      const traveler = await registerAndVerifyTraveler(server, 'traveler-detail-other-agency@test.com', 'T1');

      const createRes = await request(server())
        .post('/api/v1/trip-requests')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .send({ agencyId, message: 'Other agency detail' })
        .expect(201);

      const requestId = createRes.body.data.id;

      const otherAgency = await registerAndVerifyAgency(server, 'other-agency-detail@test.com', 'Other Agency');
      await approveAgency(otherAgency.agencyId);

      await request(server())
        .get(`/api/v1/trip-requests/${requestId}`)
        .set('Authorization', `Bearer ${otherAgency.accessToken}`)
        .expect(404);
    });
  });
});
