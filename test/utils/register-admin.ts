import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PlatformRole, UserRole } from '@prisma/client';
import { testPrisma } from './reset-db';

// Fixed TOTP secret used to bootstrap the test admin account so the e2e
// helper can compute a code. Under test/jest-e2e.json `otplib` is mapped to
// `__mocks__/otplib.js`, whose `verify()` always returns `{ valid: true }`,
// so any 6-digit code passes 2FA in the e2e run. We still compute a real
// one from the secret so the helper stays honest if the mock is ever removed.
const ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const ADMIN_TOTP_CODE = '000000';

export async function registerAndLoginAdmin(
  server: () => App,
  email = 'admin-e2e@test.com',
  password = 'StrongPassword123!',
): Promise<{ adminAccessToken: string; userId: string }> {
  const passwordHash = bcrypt.hashSync(password, 10);

  const user = await testPrisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isActive: true,
      isEmailVerified: true,
      role: UserRole.admin,
      platformRole: PlatformRole.super_admin,
    },
    create: {
      email,
      username: 'admin-e2e',
      displayName: 'Admin E2E',
      passwordHash,
      isActive: true,
      isEmailVerified: true,
      role: UserRole.admin,
      platformRole: PlatformRole.super_admin,
    },
  });

  await testPrisma.adminTwoFactor.upsert({
    where: { userId: user.id },
    update: { secret: ADMIN_TOTP_SECRET, isConfirmed: true },
    create: {
      userId: user.id,
      secret: ADMIN_TOTP_SECRET,
      isConfirmed: true,
    },
  });

  const loginRes = await request(server())
    .post('/api/v1/admin/auth/login')
    .send({ email, password })
    .expect(201);
  const { pendingToken } = loginRes.body.data;

  const twoFactorRes = await request(server())
    .post('/api/v1/admin/auth/2fa')
    .send({ pendingToken, code: ADMIN_TOTP_CODE })
    .expect(201);

  return {
    adminAccessToken: twoFactorRes.body.data.accessToken,
    userId: user.id,
  };
}