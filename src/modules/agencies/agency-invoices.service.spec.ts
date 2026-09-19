import { InvoiceStatus } from '@prisma/client';
import { AgencyInvoicesService } from './agency-invoices.service';
import { encodeCursor } from '../../common/utils/cursor-pagination.util';

describe('AgencyInvoicesService', () => {
  let prisma: any;
  let service: AgencyInvoicesService;

  beforeEach(() => {
    prisma = {
      agency: { findUnique: jest.fn() },
      agencyInvoice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new AgencyInvoicesService(prisma);
  });

  describe('listInvoices', () => {
    it('rejects a non-existent agency', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.listInvoices('agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns paginated invoices for a valid agency', async () => {
      const invoices = [
        {
          id: 'inv-1',
          agencyId: 'agency-1',
          amount: 1000,
          currency: 'USD',
          commissionAmount: 100,
          netAmount: 900,
          status: InvoiceStatus.pending,
          dueDate: new Date('2026-12-01'),
          createdAt: new Date('2026-09-01T10:00:00Z'),
          updatedAt: new Date('2026-09-01T10:00:00Z'),
        },
        {
          id: 'inv-2',
          agencyId: 'agency-1',
          amount: 2000,
          currency: 'USD',
          commissionAmount: 200,
          netAmount: 1800,
          status: InvoiceStatus.paid,
          dueDate: new Date('2026-11-01'),
          createdAt: new Date('2026-08-01T10:00:00Z'),
          updatedAt: new Date('2026-08-01T10:00:00Z'),
        },
      ];
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.agencyInvoice.findMany.mockResolvedValue(invoices);

      const result = await service.listInvoices('agency-1');

      expect(prisma.agencyInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agencyId: 'agency-1' },
          take: 21,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeDefined();
    });

    it('filters by status and applies cursor pagination', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.agencyInvoice.findMany.mockResolvedValue([]);

      await service.listInvoices('agency-1', InvoiceStatus.paid, encodeCursor({ createdAt: new Date('2026-07-01T00:00:00Z'), id: 'inv-0' }), 10);

      expect(prisma.agencyInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agencyId: 'agency-1',
            status: InvoiceStatus.paid,
          }),
          take: 11,
        }),
      );
    });
  });

  describe('getInvoice', () => {
    it('rejects an invoice that does not exist', async () => {
      prisma.agencyInvoice.findUnique.mockResolvedValue(null);

      await expect(service.getInvoice('agency-1', 'inv-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects an invoice belonging to a different agency', async () => {
      prisma.agencyInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        agencyId: 'other-agency',
      });

      await expect(service.getInvoice('agency-1', 'inv-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns the invoice for the owning agency', async () => {
      const invoice = {
        id: 'inv-1',
        agencyId: 'agency-1',
        amount: 1500,
        currency: 'USD',
        commissionAmount: 150,
        netAmount: 1350,
        status: InvoiceStatus.pending,
        dueDate: new Date('2026-12-01'),
        createdAt: new Date('2026-09-01T10:00:00Z'),
        updatedAt: null,
      };
      prisma.agencyInvoice.findUnique.mockResolvedValue(invoice);

      const result = await service.getInvoice('agency-1', 'inv-1');

      expect(result).toEqual(invoice);
    });
  });

  describe('updateStatus', () => {
    it('rejects an invoice that does not exist', async () => {
      prisma.agencyInvoice.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('agency-1', 'inv-1', InvoiceStatus.paid),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects an invoice belonging to a different agency', async () => {
      prisma.agencyInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        agencyId: 'other-agency',
      });

      await expect(
        service.updateStatus('agency-1', 'inv-1', InvoiceStatus.paid),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('updates the status and returns the invoice', async () => {
      const invoice = {
        id: 'inv-1',
        agencyId: 'agency-1',
        amount: 1500,
        currency: 'USD',
        commissionAmount: 150,
        netAmount: 1350,
        status: InvoiceStatus.pending,
        dueDate: new Date('2026-12-01'),
        createdAt: new Date('2026-09-01T10:00:00Z'),
        updatedAt: new Date('2026-09-15T10:00:00Z'),
      };
      prisma.agencyInvoice.findUnique.mockResolvedValue(invoice);
      prisma.agencyInvoice.update.mockResolvedValue({
        ...invoice,
        status: InvoiceStatus.paid,
      });

      const result = await service.updateStatus(
        'agency-1',
        'inv-1',
        InvoiceStatus.paid,
      );

      expect(prisma.agencyInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.paid, updatedAt: expect.any(Date) },
        select: expect.any(Object),
      });
      expect(result.status).toBe(InvoiceStatus.paid);
    });
  });
});

