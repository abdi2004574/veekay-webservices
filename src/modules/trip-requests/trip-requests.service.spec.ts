import {
  AgencyStatus,
  MessageType,
  TripRequestStatus,
  UserRole,
} from '@prisma/client';
import { TripRequestsService } from './trip-requests.service';

describe('TripRequestsService', () => {
  let prisma: any;
  let conversationsService: any;
  let messagesService: any;
  let service: TripRequestsService;

  beforeEach(() => {
    prisma = {
      agency: { findUnique: jest.fn() },
      package: { findUnique: jest.fn() },
      campaign: { findUnique: jest.fn() },
      tripRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      smartReplyTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    conversationsService = { create: jest.fn() };
    messagesService = { send: jest.fn() };
    service = new TripRequestsService(prisma, conversationsService, messagesService);
  });

  describe('create', () => {
    it('creates a request against an approved agency, reusing the existing conversation if one exists, and auto-posts the initial message', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.approved });
      conversationsService.create.mockResolvedValue({ id: 'convo-1' });
      prisma.package.findUnique.mockResolvedValue(null);
      prisma.campaign.findUnique.mockResolvedValue(null);
      prisma.tripRequest.create.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        packageId: null,
        campaignId: null,
        status: TripRequestStatus.pending,
        initialMessage: 'Hello',
        conversationId: 'convo-1',
        traveler: { id: 'traveler-1', username: 't1', displayName: 'T1' },
        agency: { id: 'agency-1', agencyName: 'A1', status: AgencyStatus.approved },
        package: null,
        campaign: null,
      });

      const result = await service.create('traveler-1', {
        agencyId: 'agency-1',
        message: 'Hello',
      } as any);

      expect(prisma.agency.findUnique).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
        select: { id: true, status: true },
      });
      expect(prisma.tripRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            travelerId: 'traveler-1',
            agencyId: 'agency-1',
            status: TripRequestStatus.pending,
            initialMessage: 'Hello',
            conversationId: 'convo-1',
          }),
          include: expect.any(Object),
        }),
      );
      expect(messagesService.send).toHaveBeenCalledWith('convo-1', 'traveler-1', {
        type: MessageType.text,
        body: 'Hello',
      });
      expect(result.status).toBe(TripRequestStatus.pending);
    });

    it('rejects when the target agency is not found', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('traveler-1', { agencyId: 'missing', message: 'Hi' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('rejects when the target agency is pending_verification', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.pending_verification });

      await expect(
        service.create('traveler-1', { agencyId: 'agency-1', message: 'Hi' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('rejects when packageId is provided but the package does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.approved });
      prisma.package.findUnique.mockResolvedValue(null);

      await expect(
        service.create('traveler-1', { agencyId: 'agency-1', packageId: 'pkg-missing', message: 'Hi' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('rejects when packageId belongs to a different agency', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.approved });
      prisma.package.findUnique.mockResolvedValue({ id: 'pkg-1', agencyId: 'agency-2' });

      await expect(
        service.create('traveler-1', { agencyId: 'agency-1', packageId: 'pkg-1', message: 'Hi' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('rejects when campaignId is provided but the campaign does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.approved });
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(
        service.create('traveler-1', { agencyId: 'agency-1', campaignId: 'camp-missing', message: 'Hi' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('rejects when campaignId is owned by another traveler', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.approved });
      prisma.campaign.findUnique.mockResolvedValue({ id: 'camp-1', creatorId: 'traveler-2' });

      await expect(
        service.create('traveler-1', { agencyId: 'agency-1', campaignId: 'camp-1', message: 'Hi' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.create).not.toHaveBeenCalled();
    });

    it('sets status to pending by default', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', status: AgencyStatus.approved });
      prisma.package.findUnique.mockResolvedValue(null);
      prisma.campaign.findUnique.mockResolvedValue(null);
      conversationsService.create.mockResolvedValue({ id: 'convo-1' });
      prisma.tripRequest.create.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        packageId: null,
        campaignId: null,
        status: TripRequestStatus.pending,
        initialMessage: 'Hi',
        conversationId: 'convo-1',
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.create('traveler-1', { agencyId: 'agency-1', message: 'Hi' } as any);

      expect(prisma.tripRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: TripRequestStatus.pending }),
        }),
      );
    });
  });

  describe('listMineForTraveler', () => {
    it('filters by travelerId always', async () => {
      prisma.tripRequest.findMany.mockResolvedValue([]);

      await service.listMineForTraveler('traveler-1', undefined, undefined, 20);

      expect(prisma.tripRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { travelerId: 'traveler-1' },
        }),
      );
    });

    it('applies optional status filter', async () => {
      prisma.tripRequest.findMany.mockResolvedValue([]);

      await service.listMineForTraveler('traveler-1', TripRequestStatus.pending, undefined, 20);

      expect(prisma.tripRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { travelerId: 'traveler-1', status: TripRequestStatus.pending },
        }),
      );
    });

    it('paginates with cursor and returns nextCursor when hasMore', async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `req-${i}`,
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.pending,
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      }));
      prisma.tripRequest.findMany.mockResolvedValue(items);

      const result = await service.listMineForTraveler('traveler-1', undefined, undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('req-1');
    });

    it('slices the page when hasMore is true', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `req-${i}`,
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.pending,
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      }));
      prisma.tripRequest.findMany.mockResolvedValue(items);

      const result = await service.listMineForTraveler('traveler-1', undefined, undefined, 3);

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBe('req-2');
    });
  });

  describe('listForAgency', () => {
    it('filters by agencyId always', async () => {
      prisma.tripRequest.findMany.mockResolvedValue([]);

      await service.listForAgency('agency-1', undefined, undefined, 20);

      expect(prisma.tripRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agencyId: 'agency-1' },
        }),
      );
    });

    it('applies optional status filter', async () => {
      prisma.tripRequest.findMany.mockResolvedValue([]);

      await service.listForAgency('agency-1', TripRequestStatus.in_discussion, undefined, 20);

      expect(prisma.tripRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agencyId: 'agency-1', status: TripRequestStatus.in_discussion },
        }),
      );
    });

    it('paginates with cursor', async () => {
      const items = Array.from({ length: 4 }, (_, i) => ({
        id: `req-${i}`,
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.pending,
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      }));
      prisma.tripRequest.findMany.mockResolvedValue(items);

      const result = await service.listForAgency('agency-1', undefined, undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('req-1');
    });
  });

  describe('getDetailForCaller', () => {
    it('returns the request when a traveler owns it', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.pending,
        traveler: { id: 'traveler-1', username: 't1', displayName: 'T1' },
        agency: { id: 'agency-1', agencyName: 'A1', status: AgencyStatus.approved },
        package: null,
        campaign: null,
      });

      const result = await service.getDetailForCaller('req-1', 'traveler-1', UserRole.traveler);

      expect(result.id).toBe('req-1');
      expect(prisma.agency.findUnique).not.toHaveBeenCalled();
    });

    it('returns 404 when a traveler tries to view another traveler\'s request', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-2',
        agencyId: 'agency-1',
      });

      await expect(
        service.getDetailForCaller('req-1', 'traveler-1', UserRole.traveler),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('returns the request when an agency owns it', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.pending,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1', agencyName: 'A1', status: AgencyStatus.approved },
        package: null,
        campaign: null,
      });
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });

      const result = await service.getDetailForCaller('req-1', 'agency-user-1', UserRole.agency);

      expect(result.id).toBe('req-1');
    });

    it('returns 404 when an agency tries to view another agency\'s request', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-2',
      });
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });

      await expect(
        service.getDetailForCaller('req-1', 'agency-user-1', UserRole.agency),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects other roles with forbidden', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
      });

      await expect(
        service.getDetailForCaller('req-1', 'traveler-1', 'admin' as UserRole),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });

  describe('updateStatus', () => {
    it('rejects when the calling agency doesn\'t own the request', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-2', status: TripRequestStatus.pending });

      await expect(
        service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.in_discussion),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('allows pending ? in_discussion', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.pending });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.in_discussion,
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.in_discussion);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: TripRequestStatus.in_discussion },
        include: expect.any(Object),
      });
    });

    it('allows pending ? declined', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.pending });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.declined,
        travelerId: 'traveler-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.declined);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.declined } }),
      );
    });

    it('allows pending ? cancelled', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.pending });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.cancelled,
        travelerId: 'traveler-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.cancelled);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.cancelled } }),
      );
    });

    it('allows in_discussion ? confirmed', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.in_discussion });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.confirmed,
        travelerId: 'traveler-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.confirmed);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.confirmed } }),
      );
    });

    it('allows in_discussion ? declined', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.in_discussion });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.declined,
        travelerId: 'traveler-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.declined);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.declined } }),
      );
    });

    it('allows in_discussion ? cancelled', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.in_discussion });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.cancelled,
        travelerId: 'traveler-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.cancelled);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.cancelled } }),
      );
    });

    it('allows confirmed ? completed', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.confirmed });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.completed,
        travelerId: 'traveler-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.completed);

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.completed } }),
      );
    });

    it('rejects declined ? anything with businessRule', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.declined });

      await expect(
        service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.pending),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('rejects completed ? anything with businessRule', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.completed });

      await expect(
        service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.in_discussion),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('rejects pending ? confirmed with businessRule', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.pending });

      await expect(
        service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.confirmed),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('rejects pending ? completed with businessRule', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.pending });

      await expect(
        service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.completed),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('emits a structured log entry on every successful transition', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.tripRequest.findUnique.mockResolvedValue({ id: 'req-1', agencyId: 'agency-1', status: TripRequestStatus.pending });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        agencyId: 'agency-1',
        status: TripRequestStatus.in_discussion,
        travelerId: 'traveler-1',
        packageId: null,
        campaignId: null,
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      const loggerSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});

      await service.updateStatus('req-1', 'agency-user-1', TripRequestStatus.in_discussion);

      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('trip_request.status_changed'),
      );
    });
  });

  describe('cancel', () => {
    it('cancels a pending request owned by the caller', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.pending,
      });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.cancelled,
        agencyId: 'agency-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.cancel('req-1', 'traveler-1');

      expect(prisma.tripRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: TripRequestStatus.cancelled },
        include: expect.any(Object),
      });
    });

    it('cancels an in_discussion request owned by the caller', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.in_discussion,
      });
      prisma.tripRequest.update.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.cancelled,
        agencyId: 'agency-1',
        initialMessage: '',
        conversationId: null,
        traveler: { id: 'traveler-1' },
        agency: { id: 'agency-1' },
        package: null,
        campaign: null,
      });

      await service.cancel('req-1', 'traveler-1');

      expect(prisma.tripRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TripRequestStatus.cancelled } }),
      );
    });

    it('rejects cancellation of a confirmed request with businessRule', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.confirmed,
      });

      await expect(service.cancel('req-1', 'traveler-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('rejects cancellation of a completed request with businessRule', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.completed,
      });

      await expect(service.cancel('req-1', 'traveler-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('rejects cancellation of a declined request with businessRule', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.declined,
      });

      await expect(service.cancel('req-1', 'traveler-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('rejects cancellation of an already cancelled request with businessRule', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-1',
        status: TripRequestStatus.cancelled,
      });

      await expect(service.cancel('req-1', 'traveler-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });

    it('returns 404 for a request owned by another traveler', async () => {
      prisma.tripRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        travelerId: 'traveler-2',
        status: TripRequestStatus.pending,
      });

      await expect(service.cancel('req-1', 'traveler-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.tripRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('Smart-reply templates', () => {
    it('listTemplates returns templates filtered by agencyId', async () => {
      prisma.smartReplyTemplate.findMany.mockResolvedValue([
        { id: 'tpl-1', agencyId: 'agency-1', title: 'Hi', body: 'Hello' },
      ]);

      const result = await service.listTemplates('agency-1');

      expect(prisma.smartReplyTemplate.findMany).toHaveBeenCalledWith({
        where: { agencyId: 'agency-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Hi');
    });

    it('createTemplate inserts with the supplied title and body', async () => {
      prisma.smartReplyTemplate.create.mockResolvedValue({
        id: 'tpl-1',
        agencyId: 'agency-1',
        title: 'Greeting',
        body: 'Hi there!',
      });

      const result = await service.createTemplate('agency-1', { title: 'Greeting', body: 'Hi there!' } as any);

      expect(prisma.smartReplyTemplate.create).toHaveBeenCalledWith({
        data: { agencyId: 'agency-1', title: 'Greeting', body: 'Hi there!' },
      });
      expect(result.title).toBe('Greeting');
    });

    it('updateTemplate rejects when template belongs to another agency', async () => {
      prisma.smartReplyTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', agencyId: 'agency-2' });

      await expect(
        service.updateTemplate('tpl-1', 'agency-1', { title: 'New' } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.smartReplyTemplate.update).not.toHaveBeenCalled();
    });

    it('updateTemplate applies only the fields sent', async () => {
      prisma.smartReplyTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', agencyId: 'agency-1' });
      prisma.smartReplyTemplate.update.mockResolvedValue({
        id: 'tpl-1',
        agencyId: 'agency-1',
        title: 'New Title',
        body: 'Old Body',
      });

      await service.updateTemplate('tpl-1', 'agency-1', { title: 'New Title' } as any);

      expect(prisma.smartReplyTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { title: 'New Title' },
      });
    });

    it('deleteTemplate rejects when template belongs to another agency', async () => {
      prisma.smartReplyTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', agencyId: 'agency-2' });

      await expect(service.deleteTemplate('tpl-1', 'agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.smartReplyTemplate.delete).not.toHaveBeenCalled();
    });

    it('deleteTemplate deletes a template owned by the caller', async () => {
      prisma.smartReplyTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', agencyId: 'agency-1' });

      await service.deleteTemplate('tpl-1', 'agency-1');

      expect(prisma.smartReplyTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
    });
  });
});
