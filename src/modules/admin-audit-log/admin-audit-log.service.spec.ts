import { AdminAuditLogService } from './admin-audit-log.service';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

describe('AdminAuditLogService', () => {
  let prisma: any;
  let service: AdminAuditLogService;

  beforeEach(() => {
    prisma = {
      adminAuditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new AdminAuditLogService(prisma);
  });

  describe('record', () => {
    it('creates a new audit log entry', async () => {
      const entry = {
        id: 'log-1',
        actorId: 'actor-1',
        action: 'agency.verification.approved',
        targetType: 'agency',
        targetId: 'agency-1',
        reason: null,
        metadata: null,
        createdAt: new Date(),
      };
      prisma.adminAuditLog.create.mockResolvedValue(entry);

      const result = await service.record(
        'actor-1',
        'agency.verification.approved',
        'agency',
        'agency-1',
        'looks good',
        { note: 'docs verified' },
      );

      expect(result).toEqual(entry);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'actor-1',
          action: 'agency.verification.approved',
          targetType: 'agency',
          targetId: 'agency-1',
          reason: 'looks good',
          metadata: { note: 'docs verified' },
        },
      });
    });

    it('emits an audit log entry record event', async () => {
      prisma.adminAuditLog.create.mockResolvedValue({
        id: 'log-1',
        actorId: 'actor-1',
        action: 'wallet.withdrawal.reviewed',
        targetType: 'withdrawal',
        targetId: 'wd-1',
        reason: null,
        metadata: null,
        createdAt: new Date(),
      });

      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});

      await service.record(
        'actor-1',
        'wallet.withdrawal.reviewed',
        'withdrawal',
        'wd-1',
      );

      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged.audit).toBe('admin.audit_log.recorded');
      expect(logged.action).toBe('wallet.withdrawal.reviewed');
    });
  });

  describe('findAll', () => {
    it('returns paginated results', async () => {
      prisma.adminAuditLog.findMany.mockResolvedValue([
        { id: 'log-1', createdAt: new Date('2024-01-02') },
        { id: 'log-2', createdAt: new Date('2024-01-01') },
      ]);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
          take: 21,
        }),
      );
    });

    it('filters by action', async () => {
      prisma.adminAuditLog.findMany.mockResolvedValue([
        { id: 'log-1', action: 'wallet.withdrawal.reviewed' },
      ]);

      await service.findAll({ action: 'wallet.withdrawal.reviewed' });

      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: 'wallet.withdrawal.reviewed' },
        }),
      );
    });

    it('filters by targetType', async () => {
      prisma.adminAuditLog.findMany.mockResolvedValue([]);

      await service.findAll({ targetType: 'agency' });

      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { targetType: 'agency' },
        }),
      );
    });

    it('filters by actorId', async () => {
      prisma.adminAuditLog.findMany.mockResolvedValue([]);

      await service.findAll({ actorId: 'actor-uuid' });

      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { actorId: 'actor-uuid' },
        }),
      );
    });

    it('cursor pagination works correctly', async () => {
      const items = [
        { id: 'log-1', createdAt: new Date('2024-01-03') },
        { id: 'log-0', createdAt: new Date('2024-01-02') },
        { id: 'log-3', createdAt: new Date('2024-01-01') },
      ];
      prisma.adminAuditLog.findMany.mockResolvedValue(items);

      const result = await service.findAll({}, 'log-3', 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('log-0');
      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'log-3' },
          skip: 1,
          take: 3,
        }),
      );
    });

    it('returns nextCursor null when no more pages', async () => {
      prisma.adminAuditLog.findMany.mockResolvedValue([
        { id: 'log-1', createdAt: new Date() },
      ]);

      const result = await service.findAll({}, undefined, 20);

      expect(result.nextCursor).toBeNull();
    });
  });
});
