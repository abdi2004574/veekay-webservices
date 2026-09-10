import { Injectable, Logger } from '@nestjs/common';
import {
  ContentReport,
  ReportStatus,
  ReportTargetType,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReviewReportDto } from './dto/review-report.dto';
import { ReportFilterDto } from './dto/report-filter.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto): Promise<ContentReport> {
    if (reporterId === dto.targetId) {
      throw AppException.businessRule(
        'You cannot report your own content.',
      );
    }

    this.logger.log(
      JSON.stringify({
        audit: 'content_report.created',
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      }),
    );

    return this.prisma.contentReport.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });
  }

  async findAll(
    filter: ReportFilterDto,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: ContentReport[]; nextCursor: string | null }> {
    const where: Record<string, any> = {};
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.targetType) {
      where.targetType = filter.targetType;
    }
    if (filter.reporterId) {
      where.reporterId = filter.reporterId;
    }

    const reports = await this.prisma.contentReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = reports.length > limit;
    const page = hasMore ? reports.slice(0, limit) : reports;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async findOne(id: string): Promise<ContentReport> {
    const report = await this.prisma.contentReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw AppException.notFound('Report not found.');
    }

    return report;
  }

  async review(
    actorId: string,
    id: string,
    dto: ReviewReportDto,
  ): Promise<ContentReport> {
    const report = await this.prisma.contentReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw AppException.notFound('Report not found.');
    }

    const updated = await this.prisma.contentReport.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote ?? null,
        resolvedById: actorId,
      },
    });

    await this.auditLogService.record(
      actorId,
      'content_report.reviewed',
      'content_report',
      id,
      dto.resolutionNote ?? undefined,
    );

    this.logger.log(
      JSON.stringify({
        audit: 'content_report.reviewed',
        actorId,
        reportId: id,
        status: dto.status,
      }),
    );

    return updated;
  }
}
