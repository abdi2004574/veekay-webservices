import { AgencyStatus } from '@prisma/client';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let prisma: any;
  let service: ReviewsService;

  beforeEach(() => {
    prisma = {
      agency: { findUnique: jest.fn(), update: jest.fn() },
      agencyReview: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    service = new ReviewsService(prisma);
  });

  describe('create', () => {
    it('rejects reviewing an agency that does not exist or is not approved', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('agency-1', 'user-1', { rating: 5 }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects reviewing an agency still pending verification', async () => {
      prisma.agency.findUnique.mockResolvedValue({
        id: 'agency-1',
        status: AgencyStatus.pending_verification,
      });

      await expect(
        service.create('agency-1', 'user-1', { rating: 5 }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects a duplicate review from the same traveler', async () => {
      prisma.agency.findUnique.mockResolvedValue({
        id: 'agency-1',
        status: AgencyStatus.approved,
      });
      prisma.agencyReview.findUnique.mockResolvedValue({ id: 'review-1' });

      await expect(
        service.create('agency-1', 'user-1', { rating: 5 }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('creates a review with a 7-day edit window and recomputes reputation', async () => {
      prisma.agency.findUnique.mockResolvedValue({
        id: 'agency-1',
        status: AgencyStatus.approved,
      });
      prisma.agencyReview.findUnique.mockResolvedValue(null);
      prisma.agencyReview.create.mockResolvedValue({ id: 'review-1' });
      prisma.agencyReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
      });

      await service.create('agency-1', 'user-1', { rating: 5, body: 'Great!' });

      expect(prisma.agencyReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agencyId: 'agency-1',
          reviewerId: 'user-1',
          rating: 5,
          body: 'Great!',
          editableUntil: expect.any(Date),
        }),
      });
      expect(prisma.agency.update).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
        data: { reputationScore: 4.5 },
      });
    });
  });

  describe('update', () => {
    it('rejects updating someone else’s review', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'someone-else',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(
        service.update('review-1', 'user-1', { rating: 3 }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects updating past the 7-day edit window', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'user-1',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() - 1000),
      });

      await expect(
        service.update('review-1', 'user-1', { rating: 3 }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('updates the rating within the edit window and recomputes reputation', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'user-1',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.agencyReview.update.mockResolvedValue({
        id: 'review-1',
        rating: 3,
      });
      prisma.agencyReview.aggregate.mockResolvedValue({ _avg: { rating: 3 } });

      await service.update('review-1', 'user-1', { rating: 3 });

      expect(prisma.agencyReview.update).toHaveBeenCalledWith({
        where: { id: 'review-1' },
        data: { rating: 3, body: undefined },
      });
      expect(prisma.agency.update).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
        data: { reputationScore: 3 },
      });
    });

    it('does not recompute reputation when only the body changes', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'user-1',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.agencyReview.update.mockResolvedValue({ id: 'review-1' });

      await service.update('review-1', 'user-1', { body: 'edited text' });

      expect(prisma.agency.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects deleting someone else’s review', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'someone-else',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(service.remove('review-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects deleting past the 7-day edit window', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'user-1',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() - 1000),
      });

      await expect(service.remove('review-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('deletes within the edit window and recomputes reputation', async () => {
      prisma.agencyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        reviewerId: 'user-1',
        agencyId: 'agency-1',
        editableUntil: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.agencyReview.aggregate.mockResolvedValue({
        _avg: { rating: null },
      });

      await service.remove('review-1', 'user-1');

      expect(prisma.agencyReview.delete).toHaveBeenCalledWith({
        where: { id: 'review-1' },
      });
      expect(prisma.agency.update).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
        data: { reputationScore: null },
      });
    });
  });

  describe('listForAgency', () => {
    it('paginates with a cursor when there are more results than the limit', async () => {
      const page = Array.from({ length: 3 }, (_, i) => ({ id: `r-${i}` }));
      prisma.agencyReview.findMany.mockResolvedValue(page);

      const result = await service.listForAgency('agency-1', undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('r-1');
    });
  });

  describe('listMine', () => {
    it('reports canEdit based on the editableUntil window', async () => {
      prisma.agencyReview.findMany.mockResolvedValue([
        {
          id: 'r-1',
          agencyId: 'agency-1',
          agency: { agencyName: 'Dream Travel Co.' },
          rating: 5,
          body: 'Great',
          createdAt: new Date('2026-01-01'),
          editableUntil: new Date(Date.now() + 1000 * 60 * 60),
        },
        {
          id: 'r-2',
          agencyId: 'agency-2',
          agency: { agencyName: 'Wanderlust Co.' },
          rating: 3,
          body: null,
          createdAt: new Date('2025-01-01'),
          editableUntil: new Date(Date.now() - 1000),
        },
      ]);

      const result = await service.listMine('user-1');

      expect(result[0].canEdit).toBe(true);
      expect(result[1].canEdit).toBe(false);
      expect(result[0].agencyName).toEqual('Dream Travel Co.');
    });
  });
});
