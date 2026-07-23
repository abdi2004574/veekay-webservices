import { createHash } from 'crypto';
import { TokenService } from './token.service';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

describe('TokenService', () => {
  let jwtService: any;
  let prisma: any;
  let redis: any;
  let config: any;
  let service: TokenService;

  const user = { id: 'user-1' } as any;

  beforeEach(() => {
    jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    };
    prisma = {
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    redis = { set: jest.fn() };
    config = {
      get: jest.fn(() => ({
        accessSecret: 'access-secret',
        accessExpiresIn: '15m',
        refreshSecret: 'refresh-secret',
        refreshExpiresIn: '30d',
      })),
    };

    service = new TokenService(jwtService, prisma, redis, config);
  });

  describe('issueTokenPair', () => {
    it('signs an access and refresh token and persists the refresh token hashed', async () => {
      jwtService.sign
        .mockReturnValueOnce('signed-access-token')
        .mockReturnValueOnce('signed-refresh-token');

      const tokens = await service.issueTokenPair(user, {
        deviceId: 'device-1',
        deviceName: 'iPhone',
      });

      expect(tokens).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'signed-refresh-token',
      });

      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            tokenHash: hashToken('signed-refresh-token'),
            deviceId: 'device-1',
            deviceName: 'iPhone',
          }),
        }),
      );
    });

    it('never stores the refresh token in plain text', async () => {
      jwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('plain-refresh-token');

      await service.issueTokenPair(user);

      const createCall = prisma.refreshToken.create.mock.calls[0][0];
      expect(createCall.data.tokenHash).not.toEqual('plain-refresh-token');
    });
  });

  describe('rotateRefreshToken', () => {
    it('rejects an unparseable/invalid refresh token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad token');
      });

      await expect(service.rotateRefreshToken('garbage')).rejects.toMatchObject(
        {
          getStatus: expect.any(Function),
        },
      );
    });

    it('rejects a refresh token that has been revoked', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-1' });
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        isRevoked: true,
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: hashToken('refresh-value'),
      });

      await expect(
        service.rotateRefreshToken('refresh-value'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects a refresh token whose stored hash does not match (reuse/tampering)', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-1' });
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: hashToken('a-different-token'),
      });

      await expect(
        service.rotateRefreshToken('refresh-value'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rotates on success: revokes the old token and issues a new pair', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-1' });
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: hashToken('refresh-value'),
        deviceId: 'device-1',
        deviceName: 'iPhone',
      });
      prisma.user.findUnique.mockResolvedValue(user);
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const { tokens } = await service.rotateRefreshToken('refresh-value');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'jti-1' },
        data: { isRevoked: true },
      });
      expect(tokens.accessToken).toEqual('new-access-token');
      expect(tokens.refreshToken).toEqual('new-refresh-token');
    });
  });

  describe('blacklistAccessToken', () => {
    it('blacklists using the token remaining lifetime when decodable', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      jwtService.decode.mockReturnValue({ exp: nowSeconds + 120 });

      await service.blacklistAccessToken('jti-1', 'access-token');

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('jti-1'),
        '1',
        'EX',
        expect.any(Number),
      );
      const ttl = redis.set.mock.calls[0][3];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120);
    });

    it('falls back to the configured access-token lifetime if decoding fails', async () => {
      jwtService.decode.mockImplementation(() => {
        throw new Error('cannot decode');
      });

      await service.blacklistAccessToken('jti-1', 'malformed');

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('jti-1'),
        '1',
        'EX',
        15 * 60,
      );
    });
  });

  describe('revokeAllRefreshTokensForUser', () => {
    it('revokes only the active refresh tokens for that user', async () => {
      await service.revokeAllRefreshTokensForUser('user-1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });
  });
});
