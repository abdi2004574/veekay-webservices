import {
  ContentReport,
  ReportStatus,
  ReportTargetType,
} from '@prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let prisma: any;
  let auditLogService: any;
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      contentReport: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    auditLogService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    service = new ReportsService(prisma, auditLogService);
  });

  const baseDto = {
    targetType: ReportTargetType.post,
    targetId: 'target-1',
    reason: 'This post contains spam',
  };

  describe('create', () => {
    it('rejects self-reporting', async () => {
      await expect(
        service.create('user-1', { ...baseDto, targetId: 'user-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.contentReport.create).not.toHaveBeenCalled();
    });

    it('creates a report', async () => {
      prisma.contentReport.create.mockResolvedValue({
        id: 'report-1',
        reporterId: 'user-1',
        ...baseDto,
        status: ReportStatus.pending,
        resolvedById: null,
        resolutionNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create('user-1', baseDto);

      expect(result.id).toBe('report-1');
      expect(prisma.contentReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'user-1',
          targetType: ReportTargetType.post,
          targetId: 'target-1',
          reason: 'This post contains spam',
        },
      });
    });
  });

  describe('findAll', () => {
    it('returns paginated results', async () => {
      const page = Array.from({ length: 3 }, (_, i) => ({
        id: `report-${i}`,
        createdAt: new Date(),
      }));
      prisma.contentReport.findMany.mockResolvedValue(page);

      const result = await service.findAll(
        {},
        undefined,
        2,
      );

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('report-1');
    });

    it('filters by status', async () => {
      prisma.contentReport.findMany.mockResolvedValue([]);

      await service.findAll({ status: ReportStatus.pending });

      expect(prisma.contentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ReportStatus.pending }),
        }),
      );
    });

    it('filters by targetType', async () => {
      prisma.contentReport.findMany.mockResolvedValue([]);

      await service.findAll({ targetType: ReportTargetType.review });

      expect(prisma.contentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ targetType: ReportTargetType.review }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a single report', async () => {
      prisma.contentReport.findUnique.mockResolvedValue({
        id: 'report-1',
        ...baseDto,
        status: ReportStatus.pending,
        resolvedById: null,
        resolutionNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findOne('report-1');

      expect(result.id).toBe('report-1');
      expect(prisma.contentReport.findUnique).toHaveBeenCalledWith({
        where: { id: 'report-1' },
      });
    });
  });

  describe('review', () => {
    it('updates status and resolutionNote', async () => {
      prisma.contentReport.findUnique.mockResolvedValue({
        id: 'report-1',
        ...baseDto,
        status: ReportStatus.pending,
        resolvedById: null,
        resolutionNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.contentReport.update.mockResolvedValue({
        id: 'report-1',
        status: ReportStatus.resolved,
        resolutionNote: 'Reviewed and dismissed',
        resolvedById: 'admin-1',
      });

      const result = await service.review('admin-1', 'report-1', {
        status: ReportStatus.resolved,
        resolutionNote: 'Reviewed and dismissed',
      });

      expect(result.status).toBe(ReportStatus.resolved);
      expect(result.resolutionNote).toBe('Reviewed and dismissed');
      expect(prisma.contentReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          status: ReportStatus.resolved,
          resolutionNote: 'Reviewed and dismissed',
          resolvedById: 'admin-1',
        },
      });
    });

    it('writes to audit log', async () => {
      prisma.contentReport.findUnique.mockResolvedValue({
        id: 'report-1',
        ...baseDto,
        status: ReportStatus.pending,
        resolvedById: null,
        resolutionNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.contentReport.update.mockResolvedValue({
        id: 'report-1',
        status: ReportStatus.resolved,
        resolutionNote: null,
        resolvedById: 'admin-1',
      });

      await service.review('admin-1', 'report-1', {
        status: ReportStatus.resolved,
      });

      expect(auditLogService.record).toHaveBeenCalledWith(
        'admin-1',
        'content_report.reviewed',
        'content_report',
        'report-1',
        undefined,
      );
    });
  });
});
