import { NotificationType } from '@prisma/client';
import { NotificationPreferenceService } from './notification-preference.service';
import { UpdateNotificationPreferenceDto } from '../dto/update-notification-preferences.dto';

describe('NotificationPreferenceService', () => {
  let prisma: any;
  let service: NotificationPreferenceService;

  beforeEach(() => {
    prisma = {
      notificationPreference: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new NotificationPreferenceService(prisma);
  });

  describe('listForUser', () => {
    it('returns all 19 NotificationType values with defaults when no rows exist', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      const result = await service.listForUser('user-1');

      expect(result).toHaveLength(20);
      expect(result[0]).toEqual({
        type: NotificationType.account_status,
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
      });
    });

    it('returns persisted values when rows exist mixed with defaults', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          type: NotificationType.donation,
          inAppEnabled: false,
          pushEnabled: true,
          emailEnabled: true,
        },
        {
          userId: 'user-1',
          type: NotificationType.chat_message,
          inAppEnabled: true,
          pushEnabled: false,
          emailEnabled: true,
        },
      ]);

      const result = await service.listForUser('user-1');

      expect(result).toHaveLength(20);
      const donation = result.find((r) => r.type === NotificationType.donation);
      expect(donation).toEqual({
        type: NotificationType.donation,
        inAppEnabled: false,
        pushEnabled: true,
        emailEnabled: true,
      });
      const chat = result.find((r) => r.type === NotificationType.chat_message);
      expect(chat).toEqual({
        type: NotificationType.chat_message,
        inAppEnabled: true,
        pushEnabled: false,
        emailEnabled: true,
      });
      const milestone = result.find((r) => r.type === NotificationType.milestone);
      expect(milestone).toEqual({
        type: NotificationType.milestone,
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
      });
    });
  });

  describe('getForUserAndType', () => {
    it('returns default object when no row exists', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.getForUserAndType(
        'user-1',
        NotificationType.donation,
      );

      expect(result).toEqual({
        type: NotificationType.donation,
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
      });
    });

    it('returns persisted row when it exists', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        type: NotificationType.donation,
        inAppEnabled: false,
        pushEnabled: true,
        emailEnabled: true,
      });

      const result = await service.getForUserAndType(
        'user-1',
        NotificationType.donation,
      );

      expect(result).toEqual({
        type: NotificationType.donation,
        inAppEnabled: false,
        pushEnabled: true,
        emailEnabled: true,
      });
    });
  });

  describe('set', () => {
    it('creates a new preference row with defaults for missing fields', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({
        userId: 'user-1',
        type: NotificationType.donation,
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
      });

      const result = await service.set('user-1', {
        type: NotificationType.donation,
      } as UpdateNotificationPreferenceDto);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId_type: { userId: 'user-1', type: NotificationType.donation } },
        create: {
          userId: 'user-1',
          type: NotificationType.donation,
          inAppEnabled: true,
          pushEnabled: true,
          emailEnabled: false,
        },
        update: {},
      });

      expect(result).toEqual({
        type: NotificationType.donation,
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
      });
    });

    it('updates an existing row (partial update)', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({
        userId: 'user-1',
        type: NotificationType.donation,
        inAppEnabled: false,
        pushEnabled: true,
        emailEnabled: true,
      });

      const result = await service.set('user-1', {
        type: NotificationType.donation,
        emailEnabled: true,
      } as UpdateNotificationPreferenceDto);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId_type: { userId: 'user-1', type: NotificationType.donation } },
        create: expect.any(Object),
        update: { emailEnabled: true },
      });

      expect(result).toEqual({
        type: NotificationType.donation,
        inAppEnabled: false,
        pushEnabled: true,
        emailEnabled: true,
      });
    });
  });

  describe('setBulk', () => {
    it('upserts multiple types in a transaction', async () => {
      const upsertMock = jest.fn().mockResolvedValue({});
      const txMock = jest.fn().mockImplementation(async (fn: any) =>
        fn({
          notificationPreference: { upsert: upsertMock },
        }),
      );
      prisma.$transaction = txMock;

      await service.setBulk('user-1', [
        { type: NotificationType.donation, emailEnabled: true },
        { type: NotificationType.chat_message, pushEnabled: false },
      ]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(upsertMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetDefaults', () => {
    it('deletes the row', async () => {
      prisma.notificationPreference.delete.mockResolvedValue({});

      await service.resetDefaults('user-1', NotificationType.donation);

      expect(prisma.notificationPreference.delete).toHaveBeenCalledWith({
        where: { userId_type: { userId: 'user-1', type: NotificationType.donation } },
      });
    });
  });
});
