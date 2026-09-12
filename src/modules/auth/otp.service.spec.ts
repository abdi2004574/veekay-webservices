import { OtpType } from '@prisma/client';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let prisma: any;
  let passwordService: any;
  let redis: any;
  let config: any;
  let service: OtpService;
  let otpCodeMock: any;

  beforeEach(() => {
    otpCodeMock = {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    const txMock = {
      otpCode: otpCodeMock,
    };
    prisma = {
      otpCode: otpCodeMock,
      $transaction: jest.fn(async (cb) => cb(txMock)),
    };
    passwordService = {
      hash: jest.fn((value) => Promise.resolve('hashed:' + value)),
      verify: jest.fn((plain, hash) =>
        Promise.resolve(hash === 'hashed:' + plain),
      ),
    };
    redis = {
      get: jest.fn(),
      set: jest.fn(),
    };
    config = {
      get: (key) => {
        const values = {
          'otp.expiryMinutes': 10,
          'otp.resendCooldownSeconds': 60,
          'otp.maxAttempts': 5,
        };
        return values[key];
      },
    };

    service = new OtpService(prisma, passwordService, redis, config);
  });

  describe('generateCode', () => {
    it('always generates a 6-digit, zero-padded numeric string', () => {
      for (let i = 0; i < 50; i++) {
        const code = service.generateCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });
  });

  describe('issue', () => {
    it('rejects a new request while a cooldown is active', async () => {
      redis.get.mockResolvedValue('1');
      await expect(
        service.issue('traveler@example.com', OtpType.email_verify),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('invalidates prior unused codes, stores a new hashed code, and sets a cooldown', async () => {
      redis.get.mockResolvedValue(null);

      const code = await service.issue(
        'traveler@example.com',
        OtpType.email_verify,
      );

      expect(code).toMatch(/^\d{6}$/);
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
        where: {
          identifier: 'traveler@example.com',
          type: OtpType.email_verify,
          isUsed: false,
        },
        data: { isUsed: true },
      });
      expect(prisma.otpCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: 'traveler@example.com',
            type: OtpType.email_verify,
            codeHash: 'hashed:' + code,
          }),
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('traveler@example.com'),
        '1',
        'EX',
        60,
      );
    });
  });

  describe('verify', () => {
    it('throws when no unused OTP row exists', async () => {
      otpCodeMock.findFirst.mockResolvedValue(null);
      await expect(
        service.verify('traveler@example.com', OtpType.email_verify, '123456'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('throws and does not mark used when the OTP is expired', async () => {
      otpCodeMock.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'hashed:123456',
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
      });

      await expect(
        service.verify('traveler@example.com', OtpType.email_verify, '123456'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(otpCodeMock.update).not.toHaveBeenCalled();
    });

    it('throws once max attempts have been reached', async () => {
      otpCodeMock.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'hashed:123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 5,
      });

      await expect(
        service.verify('traveler@example.com', OtpType.email_verify, '123456'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('increments attempts and throws on an incorrect code', async () => {
      otpCodeMock.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'hashed:123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 1,
      });

      await expect(
        service.verify('traveler@example.com', OtpType.email_verify, '999999'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });

      expect(otpCodeMock.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('marks the OTP used on a correct code', async () => {
      otpCodeMock.findFirst.mockResolvedValue({
        id: 'otp-1',
        codeHash: 'hashed:123456',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
      });

      await service.verify(
        'traveler@example.com',
        OtpType.email_verify,
        '123456',
      );

      expect(otpCodeMock.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { isUsed: true },
      });
    });
  });
});
