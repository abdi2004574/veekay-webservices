import { ConversationParticipantRole, ConversationType } from '@prisma/client';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  let prisma: any;
  let friendsService: any;
  let service: ConversationsService;

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      conversationParticipant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
      },
      agencyStaff: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      agency: { findUnique: jest.fn() },
      message: { count: jest.fn() },
    };
    friendsService = { areFriends: jest.fn() };
    service = new ConversationsService(prisma, friendsService);
  });

  describe('assertAccess', () => {
    it('rejects when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.assertAccess('conv-1', 'user-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('allows a live participant', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.direct,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        id: 'p-1',
        leftAt: null,
        role: ConversationParticipantRole.member,
      });

      const result = await service.assertAccess('conv-1', 'user-1');

      expect(result.isAgencyStaff).toBe(false);
      expect(result.participant!.id).toBe('p-1');
    });

    it('rejects a participant who has left', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        id: 'p-1',
        leftAt: new Date(),
      });

      await expect(
        service.assertAccess('conv-1', 'user-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('allows agency staff on an agency conversation with no participant row', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.agency,
        agencyId: 'agency-1',
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue(null);
      prisma.agencyStaff.findUnique.mockResolvedValue({ id: 'staff-1' });

      const result = await service.assertAccess('conv-1', 'staff-user');

      expect(result.isAgencyStaff).toBe(true);
      expect(result.participant).toBeNull();
    });

    it('rejects a stranger with no participant row and no staff match', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.agency,
        agencyId: 'agency-1',
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue(null);
      prisma.agencyStaff.findUnique.mockResolvedValue(null);

      await expect(
        service.assertAccess('conv-1', 'stranger'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('create — direct', () => {
    it('rejects messaging yourself', async () => {
      await expect(
        service.create('user-1', { type: 'direct', participantId: 'user-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects messaging a non-friend', async () => {
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.create('user-1', { type: 'direct', participantId: 'user-2' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('reuses an existing direct conversation instead of creating a duplicate', async () => {
      friendsService.areFriends.mockResolvedValue(true);
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-existing' });

      const result = await service.create('user-1', {
        type: 'direct',
        participantId: 'user-2',
      });

      expect(result).toEqual({ id: 'conv-existing' });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('creates a new direct conversation with both participants', async () => {
      friendsService.areFriends.mockResolvedValue(true);
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });

      await service.create('user-1', {
        type: 'direct',
        participantId: 'user-2',
      });

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          type: ConversationType.direct,
          createdById: 'user-1',
          participants: {
            create: [
              { userId: 'user-1', role: ConversationParticipantRole.member },
              { userId: 'user-2', role: ConversationParticipantRole.member },
            ],
          },
        },
      });
    });
  });

  describe('create — group', () => {
    it('rejects without a title', async () => {
      await expect(
        service.create('user-1', { type: 'group', participantIds: ['user-2'] }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects without participantIds', async () => {
      await expect(
        service.create('user-1', { type: 'group', title: 'Bali Trip' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects if any member is not a friend', async () => {
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.create('user-1', {
          type: 'group',
          title: 'Bali Trip',
          participantIds: ['user-2'],
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('creates a group with the creator as admin', async () => {
      friendsService.areFriends.mockResolvedValue(true);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-group' });

      await service.create('user-1', {
        type: 'group',
        title: 'Bali Trip',
        participantIds: ['user-2', 'user-3'],
      });

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          type: ConversationType.group,
          title: 'Bali Trip',
          createdById: 'user-1',
          participants: {
            create: [
              { userId: 'user-1', role: ConversationParticipantRole.admin },
              { userId: 'user-2', role: ConversationParticipantRole.member },
              { userId: 'user-3', role: ConversationParticipantRole.member },
            ],
          },
        },
      });
    });
  });

  describe('create — agency', () => {
    it('rejects without an agencyId', async () => {
      await expect(
        service.create('user-1', { type: 'agency' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects if the agency does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { type: 'agency', agencyId: 'agency-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('reuses an existing agency conversation for the same traveler', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-existing' });

      const result = await service.create('user-1', {
        type: 'agency',
        agencyId: 'agency-1',
      });

      expect(result).toEqual({ id: 'conv-existing' });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('creates a new agency conversation with only the traveler as a participant', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });

      await service.create('user-1', { type: 'agency', agencyId: 'agency-1' });

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          type: ConversationType.agency,
          createdById: 'user-1',
          agencyId: 'agency-1',
          participants: {
            create: [
              { userId: 'user-1', role: ConversationParticipantRole.member },
            ],
          },
        },
      });
    });
  });

  describe('addParticipants', () => {
    it('rejects on a non-group conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.direct,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        leftAt: null,
        role: ConversationParticipantRole.member,
      });

      await expect(
        service.addParticipants('conv-1', 'user-1', ['user-2']),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects a non-admin caller', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        leftAt: null,
        role: ConversationParticipantRole.member,
      });

      await expect(
        service.addParticipants('conv-1', 'user-1', ['user-2']),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects adding a non-friend', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        leftAt: null,
        role: ConversationParticipantRole.admin,
      });
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.addParticipants('conv-1', 'user-1', ['user-2']),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('adds friends as an admin', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        leftAt: null,
        role: ConversationParticipantRole.admin,
      });
      friendsService.areFriends.mockResolvedValue(true);

      await service.addParticipants('conv-1', 'user-1', ['user-2']);

      expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith({
        data: [{ conversationId: 'conv-1', userId: 'user-2' }],
        skipDuplicates: true,
      });
    });
  });

  describe('removeParticipant', () => {
    it('allows a member to leave on their own', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique
        .mockResolvedValueOnce({
          leftAt: null,
          role: ConversationParticipantRole.member,
        })
        .mockResolvedValueOnce({ id: 'p-target', leftAt: null });

      await service.removeParticipant('conv-1', 'user-1', 'user-1');

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        where: { id: 'p-target' },
        data: { leftAt: expect.any(Date) },
      });
    });

    it('rejects a non-admin removing someone else', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({
        leftAt: null,
        role: ConversationParticipantRole.member,
      });

      await expect(
        service.removeParticipant('conv-1', 'user-1', 'user-2'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('allows an admin to remove someone else', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        type: ConversationType.group,
      });
      prisma.conversationParticipant.findUnique
        .mockResolvedValueOnce({
          leftAt: null,
          role: ConversationParticipantRole.admin,
        })
        .mockResolvedValueOnce({ id: 'p-target', leftAt: null });

      await service.removeParticipant('conv-1', 'user-1', 'user-2');

      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        where: { id: 'p-target' },
        data: { leftAt: expect.any(Date) },
      });
    });
  });

  describe('unreadCount', () => {
    it('sums unread counts across all conversations', async () => {
      jest
        .spyOn(service, 'listForUser')
        .mockResolvedValue([
          { unreadCount: 2 } as any,
          { unreadCount: 5 } as any,
        ]);

      await expect(service.unreadCount('user-1')).resolves.toBe(7);
    });
  });
});
