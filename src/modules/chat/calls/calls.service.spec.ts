import { ConversationType } from '@prisma/client';
import { CallsService } from './calls.service';

describe('CallsService', () => {
  let prisma: any;
  let conversationsService: any;
  let notificationsService: any;
  let callProvider: any;
  let service: CallsService;

  beforeEach(() => {
    prisma = {
      conversationParticipant: {
        findFirst: jest.fn(),
      },
      agency: {
        findUnique: jest.fn(),
      },
    };
    conversationsService = {
      assertAccess: jest.fn(),
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    callProvider = {
      createSession: jest.fn().mockImplementation(async (payload) => ({
        id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId: payload.conversationId,
        agencyId: payload.agencyId,
        travelerId: payload.travelerId,
        initiatedBy: payload.initiatedBy,
        type: payload.type,
        status: 'active',
        providerSessionId: undefined,
        joinUrl: undefined,
        startedAt: new Date(),
        createdAt: new Date(),
      })),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    service = new CallsService(
      prisma,
      conversationsService,
      notificationsService,
      callProvider,
    );
  });

  describe('create', () => {
    it('rejects a call in a non-agency conversation', async () => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: {
          id: 'conv-1',
          type: ConversationType.direct,
          agencyId: null,
        },
        participant: { id: 'p-1' },
        isAgencyStaff: false,
      });

      await expect(
        service.create('conv-1', 'user-1', {
          conversationId: 'conv-1',
          type: 'video',
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('creates a call session when a traveler initiates', async () => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: {
          id: 'conv-1',
          type: ConversationType.agency,
          agencyId: 'agency-1',
        },
        participant: { id: 'p-1' },
        isAgencyStaff: false,
      });
      prisma.agency.findUnique.mockResolvedValue({ userId: 'agency-user-1' });

      const result = await service.create('conv-1', 'user-1', {
        conversationId: 'conv-1',
        type: 'audio',
      });

      expect(callProvider.createSession).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        initiatedBy: 'user-1',
        agencyId: 'agency-1',
        travelerId: 'user-1',
        type: 'audio',
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        'agency-user-1',
        {
          type: 'new_call',
          title: 'Traveler is calling',
          body: 'Traveler started a audio consultation call.',
          deepLinkTarget: 'chat',
          deepLinkEntityId: 'conv-1',
          metadata: {
            callSessionId: result.id,
            conversationId: 'conv-1',
            type: 'audio',
          },
        },
      );
      expect(result.conversationId).toBe('conv-1');
      expect(result.agencyId).toBe('agency-1');
      expect(result.travelerId).toBe('user-1');
      expect(result.type).toBe('audio');
      expect(result.status).toBe('active');
    });

    it('creates a call session when agency staff initiates', async () => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: {
          id: 'conv-1',
          type: ConversationType.agency,
          agencyId: 'agency-1',
        },
        participant: null,
        isAgencyStaff: true,
      });
      prisma.conversationParticipant.findFirst.mockResolvedValue({
        userId: 'traveler-1',
      });

      const result = await service.create('conv-1', 'agency-staff-1', {
        conversationId: 'conv-1',
        type: 'video',
      });

      expect(callProvider.createSession).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        initiatedBy: 'agency-staff-1',
        agencyId: 'agency-1',
        travelerId: 'traveler-1',
        type: 'video',
      });
      expect(notificationsService.create).toHaveBeenCalledWith('traveler-1', {
        type: 'new_call',
        title: 'Agency is calling',
        body: 'Agency started a video consultation call.',
        deepLinkTarget: 'chat',
        deepLinkEntityId: 'conv-1',
        metadata: {
          callSessionId: result.id,
          conversationId: 'conv-1',
          type: 'video',
        },
      });
      expect(result.travelerId).toBe('traveler-1');
    });

    it('rejects if agency conversation has no traveler participant', async () => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: {
          id: 'conv-1',
          type: ConversationType.agency,
          agencyId: 'agency-1',
        },
        participant: null,
        isAgencyStaff: true,
      });
      prisma.conversationParticipant.findFirst.mockResolvedValue(null);

      await expect(
        service.create('conv-1', 'agency-staff-1', {
          conversationId: 'conv-1',
          type: 'video',
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });

  describe('end', () => {
    it('delegates to the provider', async () => {
      await service.end('call-1', 'user-1');

      expect(callProvider.endSession).toHaveBeenCalledWith('call-1');
    });
  });
});
