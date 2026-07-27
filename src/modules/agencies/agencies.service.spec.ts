import { AgencyDocumentType, AgencyStaffPermission, AgencyStatus, UserRole } from '@prisma/client';
import { AgenciesService } from './agencies.service';

describe('AgenciesService', () => {
  let prisma: any;
  let service: AgenciesService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      agency: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    };
    service = new AgenciesService(prisma);
  });

  describe('submitRegistration', () => {
    it('rejects a non-agency user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: UserRole.traveler });

      await expect(
        service.submitRegistration('user-1', {
          businessContactDetails: '+1 555 0100',
          businessAddress: '123 Main St',
          documents: [],
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects a second registration for the same agency user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: UserRole.agency });
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });

      await expect(
        service.submitRegistration('user-1', {
          businessContactDetails: '+1 555 0100',
          businessAddress: '123 Main St',
          documents: [],
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('creates the agency with an owner staff row and submitted documents', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: UserRole.agency,
        displayName: 'Dream Travel Co.',
      });
      prisma.agency.findUnique.mockResolvedValue(null);
      prisma.agency.create.mockResolvedValue({ id: 'agency-1' });

      await service.submitRegistration('user-1', {
        businessContactDetails: '+1 555 0100',
        businessAddress: '123 Main St',
        documents: [{ type: AgencyDocumentType.business_license, mediaId: 'media-1' }],
      });

      expect(prisma.agency.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          agencyName: 'Dream Travel Co.',
          staff: { create: { userId: 'user-1', permission: AgencyStaffPermission.owner } },
        }),
        include: { documents: true },
      });
    });
  });

  describe('listDirectory', () => {
    it('only returns approved agencies, ordered by reputation', async () => {
      prisma.agency.findMany.mockResolvedValue([
        {
          id: 'agency-1',
          agencyName: 'Dream Travel Co.',
          description: null,
          reputationScore: 4.8,
          status: AgencyStatus.approved,
          _count: { reviews: 12 },
        },
      ]);

      const result = await service.listDirectory();

      expect(prisma.agency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: AgencyStatus.approved } }),
      );
      expect(result.items).toEqual([
        {
          id: 'agency-1',
          agencyName: 'Dream Travel Co.',
          description: null,
          reputationScore: 4.8,
          reviewCount: 12,
        },
      ]);
    });

    it('paginates with a cursor when there are more results than the limit', async () => {
      const page = Array.from({ length: 3 }, (_, i) => ({
        id: `agency-${i}`,
        agencyName: `Agency ${i}`,
        description: null,
        reputationScore: null,
        status: AgencyStatus.approved,
        _count: { reviews: 0 },
      }));
      prisma.agency.findMany.mockResolvedValue(page);

      const result = await service.listDirectory(undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('agency-1');
    });

    it('filters by search text against the agency name', async () => {
      prisma.agency.findMany.mockResolvedValue([]);

      await service.listDirectory(undefined, 20, 'dream');

      expect(prisma.agency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: AgencyStatus.approved,
            agencyName: { contains: 'dream', mode: 'insensitive' },
          },
        }),
      );
    });
  });

  describe('getPublicDetail', () => {
    it('rejects an agency that does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.getPublicDetail('agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects an agency that is not approved yet', async () => {
      prisma.agency.findUnique.mockResolvedValue({
        id: 'agency-1',
        status: AgencyStatus.pending_verification,
      });

      await expect(service.getPublicDetail('agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns the public shape for an approved agency', async () => {
      prisma.agency.findUnique.mockResolvedValue({
        id: 'agency-1',
        agencyName: 'Dream Travel Co.',
        description: 'We plan dream trips.',
        reputationScore: null,
        status: AgencyStatus.approved,
        _count: { reviews: 0 },
      });

      await expect(service.getPublicDetail('agency-1')).resolves.toEqual({
        id: 'agency-1',
        agencyName: 'Dream Travel Co.',
        description: 'We plan dream trips.',
        reputationScore: null,
        reviewCount: 0,
      });
    });
  });
});
