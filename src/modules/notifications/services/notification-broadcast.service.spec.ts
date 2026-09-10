import { NotificationType, UserRole } from '@prisma/client';
import { NotificationBroadcastService } from './notification-broadcast.service';
import { BroadcastNotificationDto } from '../dto/broadcast-notification.dto';

describe('NotificationBroadcastService', () => {
  let prisma: any;
  let notificationsService: any;
  let service: NotificationBroadcastService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    service = new NotificationBroadcastService(prisma, notificationsService);
  });

  const baseDto: BroadcastNotificationDto = {
    target: 'all',
    type: NotificationType.admin_broadcast,
    title: 'Heads up',
    body: 'Platform maintenance tonight.',
  };

  describe('broadcast', () => {
    it('sends to all active users when target is "all"', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1' },
        { id: 'u2' },
      ]);

      const result = await service.broadcast('admin-1', baseDto);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { id: true },
      });
      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          type: NotificationType.admin_broadcast,
          channel: undefined,
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        'u2',
        expect.objectContaining({ type: NotificationType.admin_broadcast }),
      );
      expect(result).toEqual({ sentCount: 2, failedCount: 0 });
    });

    it('sends only to travelers when target is "role" with role "traveler"', async () => {
      const dto = { ...baseDto, target: 'role', role: 'traveler' } as const;
      prisma.user.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

      const result = await service.broadcast('admin-1', dto);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: UserRole.traveler, isActive: true },
        select: { id: true },
      });
      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ sentCount: 2, failedCount: 0 });
    });

    it('sends to a single user when target is "user"', async () => {
      const dto = { ...baseDto, target: 'user', userId: 'u1' } as BroadcastNotificationDto;
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isActive: true,
      });

      const result = await service.broadcast('admin-1', dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { id: true, isActive: true },
      });
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        'u1',
        expect.any(Object),
      );
      expect(result).toEqual({ sentCount: 1, failedCount: 0 });
    });

    it('returns 0 sent for a nonexistent user', async () => {
      const dto = { ...baseDto, target: 'user', userId: 'ghost' } as BroadcastNotificationDto;
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.broadcast('admin-1', dto);

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(result).toEqual({ sentCount: 0, failedCount: 0 });
    });

    it('logs an audit event after sending', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

      await service.broadcast('admin-1', { ...baseDto, target: 'all' });

      expect(logSpy).toHaveBeenCalled();
      const logged = logSpy.mock.calls[0][0] as string;
      expect(logged).toContain('admin.broadcast.sent');
      const parsed = JSON.parse(logged);
      expect(parsed).toEqual(
        expect.objectContaining({
          audit: 'admin.broadcast.sent',
          actorUserId: 'admin-1',
          type: NotificationType.admin_broadcast,
          target: 'all',
          totalTargets: 1,
          sentCount: 1,
        }),
      );
      logSpy.mockRestore();
    });

    it('continues past failures (one bad user does not fail the whole broadcast)', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      notificationsService.create.mockImplementation(async (userId: string) => {
        if (userId === 'u2') {
          throw new Error('boom');
        }
        return { id: 'notif-1' };
      });
      jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

      const result = await service.broadcast('admin-1', baseDto);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(result.sentCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('previewSegments', () => {
    function setupCounts(counts: { travelers: number; agencies: number; admins: number }) {
      prisma.user.count.mockImplementation(async ({ where }: any) => {
        if (where.role === UserRole.traveler) return counts.travelers;
        if (where.role === UserRole.agency) return counts.agencies;
        if (where.role === UserRole.admin) return counts.admins;
        return 0;
      });
    }

    it('returns total active user count for target "all"', async () => {
      setupCounts({ travelers: 10, agencies: 3, admins: 2 });

      const result = await service.previewSegments(baseDto);

      expect(result.estimatedReach).toBe(15);
      expect(result.breakdown).toEqual({ travelers: 10, agencies: 3, admins: 2 });
      expect(prisma.user.count).toHaveBeenCalledTimes(3);
    });

    it('returns only agency count for target "role" with role "agency"', async () => {
      const dto = { ...baseDto, target: 'role', role: 'agency' } as const;
      setupCounts({ travelers: 10, agencies: 3, admins: 2 });

      const result = await service.previewSegments(dto);

      expect(result.estimatedReach).toBe(3);
      expect(result.breakdown).toEqual({ travelers: 10, agencies: 3, admins: 2 });
    });

    it('returns 1 for target "user"', async () => {
      const dto = { ...baseDto, target: 'user', userId: 'u1' } as BroadcastNotificationDto;
      setupCounts({ travelers: 10, agencies: 3, admins: 2 });

      const result = await service.previewSegments(dto);

      expect(result.estimatedReach).toBe(1);
    });
  });
});