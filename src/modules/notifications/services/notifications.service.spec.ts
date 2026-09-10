import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { AppException } from '../../../common/errors/app.exception';

describe('NotificationsService', () => {
  let prisma: any;
  let preferenceService: any;
  let pushDeviceService: any;
  let firebasePush: any;
  let mailService: any;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({
          id: 'notif-1',
          userId: 'user-1',
          type: NotificationType.donation,
          title: 'Test',
          body: 'Test body',
          read: false,
          channel: 'in_app',
          deepLinkTarget: null,
          deepLinkEntityId: null,
          metadata: null,
          createdAt: new Date(),
        }),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };

    preferenceService = {
      getForUserAndType: jest.fn().mockResolvedValue({
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled: false,
      }),
      listForUser: jest.fn(),
    };

    pushDeviceService = {
      getActiveTokensForUser: jest.fn().mockResolvedValue(['token-1', 'token-2']),
      touch: jest.fn(),
    };

    firebasePush = {
      send: jest.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' }),
      sendTokens: jest.fn().mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        failedTokens: [],
      }),
      sendToTopic: jest.fn(),
    };

    mailService = { send: jest.fn().mockResolvedValue(undefined) };

    service = new NotificationsService(
      prisma,
      preferenceService,
      pushDeviceService,
      firebasePush,
      mailService,
    );
  });

  describe('create', () => {
    it('creates a notification row with all fields from the DTO', async () => {
      const dto = {
        type: NotificationType.donation,
        title: 'Thank you',
        body: 'You received a donation',
        deepLinkTarget: 'campaign',
        deepLinkEntityId: 'camp-1',
        metadata: { key: 'value' },
        channel: 'in_app' as const,
      };

      prisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        ...dto,
        userId: 'user-1',
        read: false,
        createdAt: new Date(),
      });

      const result = await service.create('user-1', dto);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'notif-1',
          title: 'Thank you',
          body: 'You received a donation',
        }),
      );
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: dto.type,
          title: dto.title,
          body: dto.body,
          deepLinkTarget: dto.deepLinkTarget,
          deepLinkEntityId: dto.deepLinkEntityId,
          metadata: expect.any(Object),
          channel: dto.channel,
        },
      });
    });

    it('does NOT send push if pushEnabled is false', async () => {
      preferenceService.getForUserAndType.mockResolvedValue({
        inAppEnabled: true,
        pushEnabled: false,
        emailEnabled: false,
      });

      await service.create('user-1', {
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
      });

      expect(pushDeviceService.getActiveTokensForUser).not.toHaveBeenCalled();
      expect(firebasePush.sendTokens).not.toHaveBeenCalled();
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('does send push if pushEnabled is true and user has devices', async () => {
      await service.create('user-1', {
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
      });

      expect(pushDeviceService.getActiveTokensForUser).toHaveBeenCalledWith('user-1');
      expect(firebasePush.sendTokens).toHaveBeenCalledWith(
        ['token-1', 'token-2'],
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          notificationId: 'notif-1',
          type: NotificationType.donation,
        }),
      );
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { pushSentAt: expect.any(Date) },
      });
    });

    it('does NOT dispatch push if pushEnabled is true but user has no devices', async () => {
      pushDeviceService.getActiveTokensForUser.mockResolvedValue([]);

      await service.create('user-1', {
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
      });

      expect(pushDeviceService.getActiveTokensForUser).toHaveBeenCalledWith('user-1');
      expect(firebasePush.sendTokens).not.toHaveBeenCalled();
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { pushSentAt: expect.any(Date) },
      });
    });

    it('does send email for financial types when emailEnabled is true', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'user@example.com' });

      prisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        type: NotificationType.donation,
        title: 'Donation received',
        body: '$100 was donated',
        userId: 'user-1',
        read: false,
        channel: 'in_app',
        deepLinkTarget: null,
        deepLinkEntityId: null,
        metadata: null,
        createdAt: new Date(),
      });

      preferenceService.getForUserAndType.mockResolvedValue({
        inAppEnabled: true,
        pushEnabled: false,
        emailEnabled: true,
      });

      await service.create('user-1', {
        type: NotificationType.donation,
        title: 'Donation received',
        body: '$100 was donated',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { email: true },
      });
      expect(mailService.send).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Donation received',
        html: '<p>$100 was donated</p>',
      });
    });

    it('does NOT send email for non-financial types even if emailEnabled', async () => {
      preferenceService.getForUserAndType.mockResolvedValue({
        inAppEnabled: true,
        pushEnabled: false,
        emailEnabled: true,
      });

      await service.create('user-1', {
        type: NotificationType.like,
        title: 'New follower',
        body: 'Someone followed you',
      });

      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('never throws if push fails (best-effort)', async () => {
      firebasePush.sendTokens.mockRejectedValue(new Error('FCM error'));

      await expect(
        service.create('user-1', {
          type: NotificationType.donation,
          title: 'Test',
          body: 'Test body',
        }),
      ).resolves.toEqual(
        expect.objectContaining({ id: 'notif-1' }),
      );
    });

    it('never throws if email fails (best-effort)', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'user@example.com' });
      mailService.send.mockRejectedValue(new Error('SMTP error'));
      preferenceService.getForUserAndType.mockResolvedValue({
        inAppEnabled: true,
        pushEnabled: false,
        emailEnabled: true,
      });

      await expect(
        service.create('user-1', {
          type: NotificationType.donation,
          title: 'Donation received',
          body: '$100 was donated',
        }),
      ).resolves.toEqual(
        expect.objectContaining({ id: 'notif-1' }),
      );
    });
  });

  describe('listForUser', () => {
    const now = new Date();

    beforeEach(() => {
      prisma.notification.findMany.mockReset();
      prisma.notification.findMany.mockResolvedValue([]);
    });

    it('returns paginated list for a user', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          type: NotificationType.donation,
          title: 'Donation',
          body: '$50',
          read: false,
          channel: 'in_app',
          deepLinkTarget: null,
          deepLinkEntityId: null,
          metadata: null,
          createdAt: now,
        },
        {
          id: 'notif-2',
          type: NotificationType.like,
          title: 'Follow',
          body: 'New follower',
          read: true,
          channel: 'in_app',
          deepLinkTarget: null,
          deepLinkEntityId: null,
          metadata: { foo: 'bar' },
          createdAt: new Date(now.getTime() - 1000),
        },
      ];

      prisma.notification.findMany.mockResolvedValue(mockNotifications);

      const result = await service.listForUser('user-1');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('notif-1');
      expect(result.items[1].id).toBe('notif-2');
      expect(result.items[1].metadata).toEqual({ foo: 'bar' });
      expect(result.nextCursor).toBeNull();
    });

    it('respects the type filter', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          type: NotificationType.donation,
          title: 'Donation',
          body: '$50',
          read: false,
          channel: 'in_app',
          deepLinkTarget: null,
          deepLinkEntityId: null,
          metadata: null,
          createdAt: now,
        },
      ]);

      await service.listForUser('user-1', NotificationType.donation);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: NotificationType.donation,
          }),
        }),
      );
    });

    it('returns { items, nextCursor } shape', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      const result = await service.listForUser('user-1');

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles cursor pagination correctly (hasMore detection)', async () => {
      const page = Array.from({ length: 3 }, (_, i) => ({
        id: `notif-${i}`,
        type: NotificationType.donation,
        title: `Donation ${i}`,
        body: '$50',
        read: false,
        channel: 'in_app',
        deepLinkTarget: null,
        deepLinkEntityId: null,
        metadata: null,
        createdAt: new Date(now.getTime() + i * 1000),
      }));

      prisma.notification.findMany.mockResolvedValue(page);

      const result = await service.listForUser('user-1', undefined, undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('notif-0');
      expect(result.items[1].id).toBe('notif-1');
      expect(result.nextCursor).toBe('notif-1');
    });
  });

  describe('getUnreadCount', () => {
    it('returns the correct count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(3);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 3 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          read: false,
        },
      });
    });
  });

  describe('markRead', () => {
    it('marks a notification as read for the owner', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
        read: false,
        channel: 'in_app',
        deepLinkTarget: null,
        deepLinkEntityId: null,
        metadata: null,
        createdAt: new Date(),
      });
      prisma.notification.update.mockResolvedValue({
        id: 'notif-1',
        read: true,
      });

      const result = await service.markRead('notif-1', 'user-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { read: true },
      });
      expect(result).toEqual({ id: 'notif-1', read: true });
    });

    it('throws 404 if notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead('notif-1', 'user-1')).rejects.toThrow(AppException);
      await expect(service.markRead('notif-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws 404 if notification belongs to another user', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'notif-1',
        userId: 'other-user',
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
        read: false,
        channel: 'in_app',
        deepLinkTarget: null,
        deepLinkEntityId: null,
        metadata: null,
        createdAt: new Date(),
      });

      await expect(service.markRead('notif-1', 'user-1')).rejects.toThrow(AppException);
      await expect(service.markRead('notif-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead('user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          read: false,
        },
        data: { read: true },
      });
      expect(result).toEqual({ count: 5 });
    });

    it('returns the count of updated rows', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllRead('user-1');

      expect(result.count).toBe(0);
    });
  });

  describe('delete', () => {
    it('deletes a notification for the owner', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
        read: false,
        channel: 'in_app',
        deepLinkTarget: null,
        deepLinkEntityId: null,
        metadata: null,
        createdAt: new Date(),
      });
      prisma.notification.delete.mockResolvedValue({ id: 'notif-1' });

      await service.delete('notif-1', 'user-1');

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
      });
    });

    it('throws 404 if notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.delete('notif-1', 'user-1')).rejects.toThrow(AppException);
      await expect(service.delete('notif-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws 404 if notification belongs to another user', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'notif-1',
        userId: 'other-user',
        type: NotificationType.donation,
        title: 'Test',
        body: 'Test body',
        read: false,
        channel: 'in_app',
        deepLinkTarget: null,
        deepLinkEntityId: null,
        metadata: null,
        createdAt: new Date(),
      });

      await expect(service.delete('notif-1', 'user-1')).rejects.toThrow(AppException);
      await expect(service.delete('notif-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });
});
