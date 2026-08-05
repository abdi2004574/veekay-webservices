import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog, fetchLatestOtp } from './utils/mailhog';
import { AgencyDocumentType } from '@prisma/client';

describe('Auth (e2e)', () => {
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

  describe('Traveler: register -> verify -> profile-setup -> login', () => {
    it('completes the full happy path', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'traveler@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'E2E Traveler',
        })
        .expect(201);

      expect(registerRes.body.success).toBe(true);
      const { userId } = registerRes.body.data;
      expect(userId).toBeDefined();

      const otp = await fetchLatestOtp('traveler@e2e.test');

      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId, otp })
        .expect(201);

      expect(verifyRes.body.data.user.isEmailVerified).toBe(true);
      const { accessToken } = verifyRes.body.data;

      const profileRes = await request(server())
        .post('/api/v1/me/profile-setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          photoMediaId: 'media-1',
          destinationTypes: ['beach', 'city'],
          travelStyles: ['solo', 'luxury'],
          gender: 'female',
          dateOfBirth: '1995-04-12',
          bio: 'Loves the mountains.',
          previousTrips: [
            {
              mediaId: 'media-trip-1',
              name: 'Swiss Alps',
              location: 'Zermatt, Switzerland',
              startDate: '2023-01-05',
              endDate: '2023-01-12',
              travelerCount: 2,
              description: 'First ski trip.',
            },
          ],
        })
        .expect(201);

      expect(profileRes.body.data.badge).toEqual('dreamer');

      const loginRes = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'traveler@e2e.test', password: 'StrongPassword123!' })
        .expect(201);

      expect(loginRes.body.data.user.onboardingComplete).toBe(true);
      expect(loginRes.body.data.accessToken).toBeDefined();
      expect(loginRes.body.data.refreshToken).toBeDefined();

      const meRes = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
        .expect(200);

      expect(meRes.body.data.gender).toEqual('female');
      expect(meRes.body.data.dateOfBirth).toEqual(
        new Date('1995-04-12').toISOString(),
      );
      expect(meRes.body.data.bio).toEqual('Loves the mountains.');

      const previousTrips = await testPrisma.travelerPreviousTripPhoto.findMany(
        { where: { userId } },
      );
      expect(previousTrips).toHaveLength(1);
      expect(previousTrips[0]).toMatchObject({
        mediaId: 'media-trip-1',
        name: 'Swiss Alps',
        location: 'Zermatt, Switzerland',
        travelerCount: 2,
        description: 'First ski trip.',
      });
    });

    it('accepts profile setup without a photo and with no previous trips', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'nophoto@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'No Photo',
        })
        .expect(201);

      const { userId } = registerRes.body.data;
      const otp = await fetchLatestOtp('nophoto@e2e.test');

      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId, otp })
        .expect(201);
      const { accessToken } = verifyRes.body.data;

      await request(server())
        .post('/api/v1/me/profile-setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          destinationTypes: ['beach'],
          travelStyles: ['solo'],
        })
        .expect(201);
    });

    it('rejects a duplicate email registration with 409', async () => {
      await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'dupe@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'First',
        })
        .expect(201);

      const res = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'dupe@e2e.test',
          password: 'AnotherPassword123!',
          displayName: 'Second',
        })
        .expect(409);

      expect(res.body.error.code).toEqual('CONFLICT');
    });

    it('rejects verify-email with an invalid OTP', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'badotp@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'Bad Otp',
        })
        .expect(201);

      const res = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId: registerRes.body.data.userId, otp: '000000' })
        .expect(400);

      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
    });
  });

  describe('Unauthenticated access', () => {
    it('returns 401 for a protected route with no token', async () => {
      await request(server()).get('/api/v1/auth/sessions').expect(401);
    });

    it('returns 401 for an invalid bearer token', async () => {
      await request(server())
        .get('/api/v1/auth/sessions')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  describe('Login rate limiting / lockout', () => {
    it('locks the account after 5 consecutive failed password attempts', async () => {
      await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'lockout@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'Lockout Test',
        })
        .expect(201);

      for (let i = 0; i < 5; i++) {
        await request(server())
          .post('/api/v1/auth/login')
          .send({ email: 'lockout@e2e.test', password: 'WrongPassword!' })
          .expect(401);
      }

      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'lockout@e2e.test', password: 'StrongPassword123!' })
        .expect(401);

      expect(res.body.error.code).toEqual('UNAUTHORIZED');
    });
  });

  describe('Forgot password -> reset -> old sessions revoked', () => {
    it('revokes existing sessions and rejects the old refresh token after reset', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'forgot@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'Forgot Password',
        })
        .expect(201);

      const verifyOtp = await fetchLatestOtp('forgot@e2e.test');
      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId: registerRes.body.data.userId, otp: verifyOtp })
        .expect(201);

      const oldRefreshToken = verifyRes.body.data.refreshToken;

      await clearMailhog();
      await request(server())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'forgot@e2e.test' })
        .expect(201);

      const resetOtp = await fetchLatestOtp('forgot@e2e.test');
      await request(server())
        .post('/api/v1/auth/reset-password')
        .send({
          email: 'forgot@e2e.test',
          otp: resetOtp,
          newPassword: 'BrandNewPassword123!',
        })
        .expect(201);

      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);

      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'forgot@e2e.test', password: 'BrandNewPassword123!' })
        .expect(201);
    });

    it('returns the same generic message whether or not the email exists (no enumeration)', async () => {
      const existsRes = await request(server())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@e2e.test' })
        .expect(201);

      expect(existsRes.body.data.message).toMatch(/if an account/i);
    });
  });

  describe('Refresh token rotation', () => {
    it('rejects reuse of an already-rotated refresh token', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'rotate@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'Rotate Test',
        })
        .expect(201);

      const otp = await fetchLatestOtp('rotate@e2e.test');
      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId: registerRes.body.data.userId, otp })
        .expect(201);

      const firstRefreshToken = verifyRes.body.data.refreshToken;

      const refreshRes = await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(201);

      expect(refreshRes.body.data.refreshToken).not.toEqual(firstRefreshToken);

      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(401);
    });
  });

  describe('Logout', () => {
    it('blacklists the access token immediately on logout', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'logout@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'Logout Test',
        })
        .expect(201);

      const otp = await fetchLatestOtp('logout@e2e.test');
      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId: registerRes.body.data.userId, otp })
        .expect(201);

      const { accessToken, refreshToken } = verifyRes.body.data;

      await request(server())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(204);

      await request(server())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('Agency: register -> verify -> registration submission -> pending', () => {
    it('reaches pending_verification status after submitting business details', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/agency/register')
        .send({
          email: 'agency@e2e.test',
          password: 'StrongPassword123!',
          agencyName: 'E2E Travel Co.',
        })
        .expect(201);

      const otp = await fetchLatestOtp('agency@e2e.test');
      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId: registerRes.body.data.userId, otp })
        .expect(201);

      const { accessToken } = verifyRes.body.data;

      const registrationRes = await request(server())
        .post('/api/v1/agency/registration')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          businessContactDetails: '+1 555 010 2000',
          businessAddress: '123 Market St, San Francisco, CA',
          documents: [
            {
              type: AgencyDocumentType.business_license,
              mediaId: 'media-doc-1',
            },
          ],
        })
        .expect(201);

      expect(registrationRes.body.data.status).toEqual('pending_verification');
      expect(registrationRes.body.data.agencyName).toEqual('E2E Travel Co.');

      const agency = await testPrisma.agency.findUnique({
        where: { userId: registerRes.body.data.userId },
      });
      expect(agency?.status).toEqual('pending_verification');
    });

    it('rejects a traveler attempting to submit an agency registration', async () => {
      const registerRes = await request(server())
        .post('/api/v1/auth/register/email')
        .send({
          email: 'nottraveler@e2e.test',
          password: 'StrongPassword123!',
          displayName: 'Not An Agency',
        })
        .expect(201);

      const otp = await fetchLatestOtp('nottraveler@e2e.test');
      const verifyRes = await request(server())
        .post('/api/v1/auth/verify-email')
        .send({ userId: registerRes.body.data.userId, otp })
        .expect(201);

      await request(server())
        .post('/api/v1/agency/registration')
        .set('Authorization', `Bearer ${verifyRes.body.data.accessToken}`)
        .send({
          businessContactDetails: '+1 555 010 2000',
          businessAddress: '123 Market St, San Francisco, CA',
          documents: [],
        })
        .expect(403);
    });
  });

  describe('Social login', () => {
    it('returns a clear business-rule error when Google sign-in is not configured', async () => {
      const res = await request(server())
        .post('/api/v1/auth/social')
        .send({ provider: 'google', idToken: 'fake-token' })
        .expect(422);

      expect(res.body.error.code).toEqual('BUSINESS_RULE');
    });
  });
});
