const verifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

jest.mock('apple-signin-auth', () => ({
  __esModule: true,
  default: { verifyIdToken: jest.fn() },
}));

import appleSignin from 'apple-signin-auth';
import { SocialAuthService } from './social-auth.service';

describe('SocialAuthService', () => {
  let config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn(() => ({
        googleClientId: 'google-client-id',
        appleClientId: 'apple-client-id',
      })),
    };
  });

  describe('verifyGoogleIdToken', () => {
    it('returns the provider user id and email for a valid token', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'traveler@example.com',
        }),
      });

      const service = new SocialAuthService(config);
      const result = await service.verifyGoogleIdToken('valid-token');

      expect(result).toEqual({
        providerUserId: 'google-sub-1',
        email: 'traveler@example.com',
      });
    });

    it('rejects when Google rejects the token', async () => {
      verifyIdToken.mockRejectedValue(new Error('invalid token'));

      const service = new SocialAuthService(config);
      await expect(
        service.verifyGoogleIdToken('bad-token'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects when the payload is missing sub/email', async () => {
      verifyIdToken.mockResolvedValue({ getPayload: () => ({}) });

      const service = new SocialAuthService(config);
      await expect(
        service.verifyGoogleIdToken('token-without-claims'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('refuses to verify when Google is not configured', async () => {
      config.get = jest.fn(() => ({ googleClientId: '', appleClientId: '' }));
      const service = new SocialAuthService(config);

      await expect(service.verifyGoogleIdToken('token')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('verifyAppleIdToken', () => {
    it('returns the provider user id and email for a valid token', async () => {
      (appleSignin.verifyIdToken as jest.Mock).mockResolvedValue({
        sub: 'apple-sub-1',
        email: 'traveler@example.com',
      });

      const service = new SocialAuthService(config);
      const result = await service.verifyAppleIdToken('valid-token');

      expect(result).toEqual({
        providerUserId: 'apple-sub-1',
        email: 'traveler@example.com',
      });
    });

    it('rejects when Apple rejects the token', async () => {
      (appleSignin.verifyIdToken as jest.Mock).mockRejectedValue(
        new Error('invalid token'),
      );

      const service = new SocialAuthService(config);
      await expect(
        service.verifyAppleIdToken('bad-token'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
});
