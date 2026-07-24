import { OtpType, PlatformRole, UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let prisma: any;
  let passwordService: any;
  let otpService: any;
  let tokenService: any;
  let socialAuthService: any;
  let twoFactorService: any;
  let mailService: any;
  let jwtService: any;
  let redis: any;
  let config: any;
  let service: AuthService;

  const configValues: Record<string, unknown> = {
    'login.lockoutThreshold': 5,
    'login.lockoutMinutes': 15,
    jwt: {
      accessSecret: 'access-secret',
      accessExpiresIn: '15m',
      refreshSecret: 'refresh-secret',
      refreshExpiresIn: '30d',
    },
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      socialIdentity: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      adminTwoFactor: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    passwordService = {
      hash: jest.fn((v: string) => Promise.resolve(`hashed:${v}`)),
      verify: jest.fn(),
    };
    otpService = {
      issue: jest.fn().mockResolvedValue('123456'),
      verify: jest.fn(),
    };
    tokenService = {
      issueTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
      rotateRefreshToken: jest.fn(),
      blacklistAccessToken: jest.fn(),
      revokeRefreshTokenByValue: jest.fn(),
      revokeAllRefreshTokensForUser: jest.fn(),
    };
    socialAuthService = {
      verifyGoogleIdToken: jest.fn(),
      verifyAppleIdToken: jest.fn(),
    };
    twoFactorService = { verify: jest.fn() };
    mailService = {
      sendOtpEmail: jest.fn(),
      sendPasswordChangedEmail: jest.fn(),
    };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
    };
    config = { get: jest.fn((key: string) => configValues[key]) };

    service = new AuthService(
      prisma,
      passwordService,
      otpService,
      tokenService,
      socialAuthService,
      twoFactorService,
      mailService,
      jwtService,
      redis,
      config,
    );
  });

  describe('registerTraveler', () => {
    it('rejects registration when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.registerTraveler({
          email: 'traveler@example.com',
          password: 'StrongPassword123!',
          displayName: 'Jane',
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates an unverified traveler and sends a verification OTP', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'traveler@example.com',
      });

      const result = await service.registerTraveler({
        email: 'traveler@example.com',
        password: 'StrongPassword123!',
        displayName: 'Jane',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'traveler@example.com',
          username: 'jane',
          passwordHash: 'hashed:StrongPassword123!',
          role: UserRole.traveler,
          displayName: 'Jane',
        },
      });
      expect(otpService.issue).toHaveBeenCalledWith(
        'traveler@example.com',
        OtpType.email_verify,
      );
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith(
        'traveler@example.com',
        '123456',
        'verify',
      );
      expect(result.userId).toEqual('user-1');
    });
  });

  describe('verifyEmail', () => {
    it('propagates an invalid/expired OTP error without issuing tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'traveler@example.com',
      });
      otpService.verify.mockRejectedValue(new Error('invalid otp'));

      await expect(
        service.verifyEmail({ userId: 'user-1', otp: '000000' }),
      ).rejects.toThrow('invalid otp');
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('marks the email verified and issues tokens on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'traveler@example.com',
      });
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'traveler@example.com',
        isEmailVerified: true,
      });

      const result = await service.verifyEmail({
        userId: 'user-1',
        otp: '123456',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ isEmailVerified: true }),
        }),
      );
      expect(result.tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('login', () => {
    const user = {
      id: 'user-1',
      email: 'traveler@example.com',
      passwordHash: 'hashed:StrongPassword123!',
      role: UserRole.traveler,
      isActive: true,
    };

    it('locks out after the configured number of failed attempts', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);
      passwordService.verify.mockResolvedValue(false);
      redis.incr.mockResolvedValue(5);

      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(user.email),
        '1',
        'EX',
        15 * 60,
      );
    });

    it('rejects login while an account is locked out, without checking the password', async () => {
      redis.get.mockResolvedValue('1');

      await expect(
        service.login({ email: user.email, password: 'whatever' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it('logs in successfully with a correct password and clears prior attempts', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);
      passwordService.verify.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({
        ...user,
        lastLoginAt: new Date(),
      });

      const result = await service.login({
        email: user.email,
        password: 'StrongPassword123!',
      });

      expect(redis.del).toHaveBeenCalled();
      expect(result.tokens.accessToken).toEqual('access-token');
    });

    it('logs in via a valid login OTP', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.update.mockResolvedValue(user);

      const result = await service.login({ email: user.email, otp: '123456' });

      expect(otpService.verify).toHaveBeenCalledWith(
        user.email,
        OtpType.login,
        '123456',
      );
      expect(result.user).toEqual(user);
    });

    it('rejects admin accounts, directing them to the admin login endpoint', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        role: UserRole.admin,
      });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: user.email, password: 'StrongPassword123!' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects a deactivated account', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: user.email, password: 'StrongPassword123!' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects an agency logging in through the traveler-scoped expectedRole check', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        role: UserRole.agency,
      });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login(
          { email: user.email, password: 'StrongPassword123!' },
          UserRole.traveler,
        ),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });

  describe('socialLogin', () => {
    it('logs in directly when the social identity already exists', async () => {
      const existingUser = {
        id: 'user-1',
        isActive: true,
        role: UserRole.traveler,
      };
      socialAuthService.verifyGoogleIdToken.mockResolvedValue({
        providerUserId: 'google-sub',
        email: 'traveler@example.com',
      });
      prisma.socialIdentity.findUnique.mockResolvedValue({
        user: existingUser,
      });
      prisma.user.update.mockResolvedValue(existingUser);

      const result = await service.socialLogin({
        provider: 'google',
        idToken: 'token',
      });

      expect(prisma.socialIdentity.create).not.toHaveBeenCalled();
      expect(result.tokens.accessToken).toEqual('access-token');
    });

    it('links to an existing password-based traveler account by email instead of duplicating', async () => {
      socialAuthService.verifyGoogleIdToken.mockResolvedValue({
        providerUserId: 'google-sub',
        email: 'traveler@example.com',
      });
      prisma.socialIdentity.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: UserRole.traveler,
        isEmailVerified: false,
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        role: UserRole.traveler,
        isEmailVerified: true,
        isActive: true,
      });

      await service.socialLogin({
        provider: 'google',
        idToken: 'token',
      });

      expect(prisma.socialIdentity.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          provider: 'google',
          providerUserId: 'google-sub',
        },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses to link social login to an existing agency/admin account', async () => {
      socialAuthService.verifyGoogleIdToken.mockResolvedValue({
        providerUserId: 'google-sub',
        email: 'agency@example.com',
      });
      prisma.socialIdentity.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'agency-1',
        role: UserRole.agency,
      });

      await expect(
        service.socialLogin({ provider: 'google' as any, idToken: 'token' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('creates a new verified traveler when no account exists at all', async () => {
      socialAuthService.verifyGoogleIdToken.mockResolvedValue({
        providerUserId: 'google-sub',
        email: 'newtraveler@example.com',
      });
      prisma.socialIdentity.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-2',
        role: UserRole.traveler,
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-2',
        role: UserRole.traveler,
        isActive: true,
      });

      await service.socialLogin({
        provider: 'google',
        idToken: 'token',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'newtraveler@example.com',
          username: 'newtraveler',
          role: UserRole.traveler,
          isEmailVerified: true,
        },
      });
    });
  });

  describe('refresh', () => {
    it('delegates to TokenService and returns the new pair', async () => {
      tokenService.rotateRefreshToken.mockResolvedValue({
        user: { id: 'user-1' },
        tokens: { accessToken: 'a2', refreshToken: 'r2' },
      });

      const tokens = await service.refresh('old-refresh-token');

      expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith(
        'old-refresh-token',
      );
      expect(tokens).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    });
  });

  describe('forgotPassword', () => {
    it('returns a generic message and sends nothing when the email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'ghost@example.com',
      });

      expect(otpService.issue).not.toHaveBeenCalled();
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
      expect(result.message).toMatch(/if an account/i);
    });

    it('sends a reset OTP when the email exists, with the same generic response', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'traveler@example.com',
      });

      const result = await service.forgotPassword({
        email: 'traveler@example.com',
      });

      expect(otpService.issue).toHaveBeenCalledWith(
        'traveler@example.com',
        OtpType.password_reset,
      );
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith(
        'traveler@example.com',
        '123456',
        'reset',
      );
      expect(result.message).toMatch(/if an account/i);
    });
  });

  describe('resetPassword', () => {
    it('updates the password, revokes every session, and notifies the user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'traveler@example.com',
      });
      otpService.verify.mockResolvedValue(undefined);

      await service.resetPassword({
        email: 'traveler@example.com',
        otp: '123456',
        newPassword: 'NewStrongPassword123!',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'hashed:NewStrongPassword123!' },
      });
      expect(tokenService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalledWith(
        'traveler@example.com',
      );
    });
  });

  describe('admin login + 2FA', () => {
    const adminUser = {
      id: 'admin-1',
      email: 'admin@veakay.com',
      role: UserRole.admin,
      platformRole: PlatformRole.super_admin,
      passwordHash: 'hashed:StrongPassword123!',
      isActive: true,
    };

    it('rejects a non-admin or non-super_admin account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...adminUser,
        platformRole: PlatformRole.user,
      });

      await expect(
        service.adminLogin({
          email: adminUser.email,
          password: 'StrongPassword123!',
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('issues a short-lived pending token on valid admin credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      passwordService.verify.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('pending-token');

      const result = await service.adminLogin({
        email: adminUser.email,
        password: 'StrongPassword123!',
      });

      expect(result.pendingToken).toEqual('pending-token');
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('rejects a pending token that is not actually a 2FA-stage token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'admin-1',
        stage: 'something-else',
      });

      await expect(
        service.adminTwoFactor({ pendingToken: 'token', code: '123456' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects an invalid TOTP code', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'admin-1',
        stage: 'admin_2fa_pending',
      });
      prisma.adminTwoFactor.findUnique.mockResolvedValue({
        userId: 'admin-1',
        secret: 'topsecret',
        isConfirmed: true,
      });
      twoFactorService.verify.mockResolvedValue(false);

      await expect(
        service.adminTwoFactor({ pendingToken: 'token', code: '000000' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('issues full tokens with twoFactorConfirmed on a valid TOTP code', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'admin-1',
        stage: 'admin_2fa_pending',
      });
      prisma.adminTwoFactor.findUnique.mockResolvedValue({
        userId: 'admin-1',
        secret: 'topsecret',
        isConfirmed: true,
      });
      twoFactorService.verify.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue(adminUser);

      const result = await service.adminTwoFactor({
        pendingToken: 'token',
        code: '123456',
      });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(adminUser, {
        twoFactorConfirmed: true,
      });
      expect(result.user).toEqual(adminUser);
    });
  });
});
