import request from 'supertest';
import { App } from 'supertest/types';
import { fetchLatestOtp } from './mailhog';

export async function registerAndVerifyTraveler(
  server: () => App,
  email: string,
  displayName: string,
): Promise<{ userId: string; accessToken: string; refreshToken: string }> {
  const registerRes = await request(server())
    .post('/api/v1/auth/register/email')
    .send({ email, password: 'StrongPassword123!', displayName })
    .expect(201);

  const { userId } = registerRes.body.data;
  const otp = await fetchLatestOtp(email);

  const verifyRes = await request(server())
    .post('/api/v1/auth/verify-email')
    .send({ userId, otp })
    .expect(201);

  return {
    userId,
    accessToken: verifyRes.body.data.accessToken,
    refreshToken: verifyRes.body.data.refreshToken,
  };
}
