import { PushDeviceService } from './push-device.service';

describe('PushDeviceService', () => {
  let prisma: any;
  let service: PushDeviceService;

  beforeEach(() => {
    prisma = {
      pushDevice: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new PushDeviceService(prisma);
  });

  describe('register', () => {
    it('creates new device when token does not exist', async () => {
      prisma.pushDevice.upsert.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-1',
        fcmToken: 'token-1',
        platform: 'ios',
        lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.register('user-1', 'token-1', 'ios');

      expect(prisma.pushDevice.upsert).toHaveBeenCalledWith({
        where: { fcmToken: 'token-1' },
        create: {
          userId: 'user-1',
          fcmToken: 'token-1',
          platform: 'ios',
          lastSeenAt: expect.any(Date),
        },
        update: {
          userId: 'user-1',
          platform: 'ios',
          lastSeenAt: expect.any(Date),
        },
      });
      expect(result).toMatchObject({
        userId: 'user-1',
        fcmToken: 'token-1',
        platform: 'ios',
      });
    });

    it('updates existing device when token exists for different user', async () => {
      prisma.pushDevice.upsert.mockResolvedValue({
        id: 'dev-1',
        userId: 'user-2',
        fcmToken: 'token-1',
        platform: 'android',
        lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.register('user-2', 'token-1', 'android');

      expect(prisma.pushDevice.upsert).toHaveBeenCalledWith({
        where: { fcmToken: 'token-1' },
        create: {
          userId: 'user-2',
          fcmToken: 'token-1',
          platform: 'android',
          lastSeenAt: expect.any(Date),
        },
        update: {
          userId: 'user-2',
          platform: 'android',
          lastSeenAt: expect.any(Date),
        },
      });
      expect(result.userId).toBe('user-2');
    });
  });

  describe('unregister', () => {
    it('deletes the matching device', async () => {
      prisma.pushDevice.deleteMany.mockResolvedValue({ count: 1 });

      await service.unregister('user-1', 'token-1');

      expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', fcmToken: 'token-1' },
      });
    });

    it('is a no-op when device does not exist', async () => {
      prisma.pushDevice.deleteMany.mockResolvedValue({ count: 0 });

      await service.unregister('user-1', 'token-1');

      expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', fcmToken: 'token-1' },
      });
    });
  });

  describe('unregisterById', () => {
    it('deletes by id when owned by user', async () => {
      prisma.pushDevice.deleteMany.mockResolvedValue({ count: 1 });

      await service.unregisterById('dev-1', 'user-1');

      expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
        where: { id: 'dev-1', userId: 'user-1' },
      });
    });

    it('throws 404 when device does not exist', async () => {
      prisma.pushDevice.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unregisterById('dev-1', 'user-1')).rejects.toThrow(
        'Push device not found.',
      );
    });

    it('throws 404 when device belongs to different user', async () => {
      prisma.pushDevice.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unregisterById('dev-1', 'user-1')).rejects.toThrow(
        'Push device not found.',
      );
    });
  });

  describe('listForUser', () => {
    it('returns devices ordered by lastSeenAt desc then createdAt desc', async () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const older = new Date('2025-12-31T00:00:00.000Z');
      prisma.pushDevice.findMany.mockResolvedValue([
        { id: 'dev-1', fcmToken: 'token-1', lastSeenAt: now, createdAt: now },
        { id: 'dev-2', fcmToken: 'token-2', lastSeenAt: older, createdAt: now },
      ]);

      const result = await service.listForUser('user-1');

      expect(prisma.pushDevice.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getActiveTokensForUser', () => {
    it('returns array of fcmToken strings', async () => {
      prisma.pushDevice.findMany.mockResolvedValue([
        { fcmToken: 'token-1' },
        { fcmToken: 'token-2' },
      ]);

      const result = await service.getActiveTokensForUser('user-1');

      expect(result).toEqual(['token-1', 'token-2']);
    });
  });

  describe('touch', () => {
    it('updates lastSeenAt for matching device', async () => {
      prisma.pushDevice.updateMany.mockResolvedValue({ count: 1 });

      await service.touch('token-1');

      expect(prisma.pushDevice.updateMany).toHaveBeenCalledWith({
        where: { fcmToken: 'token-1' },
        data: { lastSeenAt: expect.any(Date) },
      });
    });
  });

  describe('removeStaleTokens', () => {
    it('deletes devices with matching tokens and returns count', async () => {
      prisma.pushDevice.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.removeStaleTokens(['token-1', 'token-2']);

      expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
        where: { fcmToken: { in: ['token-1', 'token-2'] } },
      });
      expect(result).toBe(3);
    });

    it('returns 0 for empty array', async () => {
      const result = await service.removeStaleTokens([]);

      expect(result).toBe(0);
      expect(prisma.pushDevice.deleteMany).not.toHaveBeenCalled();
    });
  });
});
