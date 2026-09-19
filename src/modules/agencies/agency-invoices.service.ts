import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, AgencyInvoice } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { encodeCursor, decodeCursor, CursorPage } from '../../common/utils/cursor-pagination.util';

@Injectable()
export class AgencyInvoicesService {
  private readonly logger = new Logger(AgencyInvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listInvoices(agencyId: string, status?: InvoiceStatus, cursor?: string, limit = 20) {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw AppException.notFound('Agency not found');

    const decodedCursor = decodeCursor(cursor);
    const whereClause: any = { agencyId };
    if (status) whereClause.status = status;
    if (decodedCursor) whereClause.createdAt = { lt: decodedCursor.createdAt };

    const invoices = await this.prisma.agencyInvoice.findMany({
      where: whereClause,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, agencyId: true, tripRequestId: true, amount: true, currency: true,
        commissionAmount: true, netAmount: true, status: true, dueDate: true,
        createdAt: true, updatedAt: true,
      },
    });

    const page = toCursorPage(invoices, limit);
    return page;
  }

  async getInvoice(agencyId: string, id: string) {
    const invoice = await this.prisma.agencyInvoice.findUnique({
      where: { id },
      select: {
        id: true, agencyId: true, tripRequestId: true, amount: true, currency: true,
        commissionAmount: true, netAmount: true, status: true, dueDate: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!invoice || invoice.agencyId !== agencyId) throw AppException.notFound('Invoice not found');
    return invoice;
  }

  async updateStatus(agencyId: string, id: string, status: InvoiceStatus) {
    const invoice = await this.prisma.agencyInvoice.findUnique({ where: { id } });
    if (!invoice || invoice.agencyId !== agencyId) throw AppException.notFound('Invoice not found');

    return this.prisma.agencyInvoice.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      select: {
        id: true, agencyId: true, tripRequestId: true, amount: true, currency: true,
        commissionAmount: true, netAmount: true, status: true, dueDate: true,
        createdAt: true, updatedAt: true,
      },
    });
  }
}

function toCursorPage<T extends { id: string; createdAt: Date }>(items: T[], limit: number): CursorPage<T> {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page,
    cursor: page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
    hasMore,
  };
}
