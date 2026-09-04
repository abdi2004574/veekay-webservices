import request from 'supertest';
import { App } from 'supertest/types';
import { AgencyDocumentType, AgencyStatus } from '@prisma/client';
import { fetchLatestOtp } from './mailhog';
import { testPrisma } from './reset-db';

// No admin approve/reject endpoint exists yet (tracked gap, feature #11) — a
// direct DB update is the only way to get an agency past pending_verification
// for tests that need an approved agency (e.g. reviews, the public directory).
export async function approveAgency(agencyId: string): Promise<void> {
  await testPrisma.agency.update({
    where: { id: agencyId },
    data: { status: AgencyStatus.approved },
  });
}

export async function registerAndVerifyAgency(
  server: () => App,
  email: string,
  agencyName: string,
): Promise<{ userId: string; agencyId: string; accessToken: string }> {
  const registerRes = await request(server())
    .post('/api/v1/auth/agency/register')
    .send({ email, password: 'StrongPassword123!', agencyName })
    .expect(201);

  const { userId } = registerRes.body.data;
  const otp = await fetchLatestOtp(email);

  const verifyRes = await request(server())
    .post('/api/v1/auth/verify-email')
    .send({ userId, otp })
    .expect(201);
  const { accessToken } = verifyRes.body.data;

  const registrationRes = await request(server())
    .post('/api/v1/agency/registration')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      businessContactDetails: '+1 555 010 2000',
      businessAddress: '123 Market St, San Francisco, CA',
      documents: [
        { type: AgencyDocumentType.business_license, mediaId: 'media-doc-1' },
      ],
    })
    .expect(201);

  return { userId, agencyId: registrationRes.body.data.id, accessToken };
}

export async function registerApprovedAgency(
  server: () => App,
  email = 'agency-e2e@test.com',
  agencyName = 'Test Agency',
): Promise<{ agencyAccessToken: string; agencyId: string }> {
  const { agencyId, accessToken } = await registerAndVerifyAgency(
    server,
    email,
    agencyName,
  );
  await approveAgency(agencyId);
  return { agencyAccessToken: accessToken, agencyId };
}
