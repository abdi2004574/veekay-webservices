import { FriendRequestStatus } from '@prisma/client';
import { FriendsService } from './friends.service';

describe('FriendsService', () => {
  let prisma: any;
  let service: FriendsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      friendRequest: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const mockNotificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };
    service = new FriendsService(prisma, mockNotificationsService as any);
  });

  describe('sendRequest', () => {
    it('rejects sending a request to yourself', async () => {
      await expect(
        service.sendRequest('user-1', 'user-1'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects if the addressee does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.sendRequest('user-1', 'user-2'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects a duplicate pending or accepted request in either direction', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      prisma.friendRequest.findFirst.mockResolvedValue({
        status: FriendRequestStatus.pending,
      });

      await expect(
        service.sendRequest('user-1', 'user-2'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('creates a pending friend request', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      prisma.friendRequest.findFirst.mockResolvedValue(null);
      prisma.friendRequest.create.mockResolvedValue({ id: 'req-1' });

      await service.sendRequest('user-1', 'user-2');

      expect(prisma.friendRequest.create).toHaveBeenCalledWith({
        data: { requesterId: 'user-1', addresseeId: 'user-2' },
      });
    });
  });

  describe('accept / decline', () => {
    it('rejects accepting a request not addressed to you', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        addresseeId: 'user-2',
        status: FriendRequestStatus.pending,
      });

      await expect(service.accept('req-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects accepting a request that already has a response', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        addresseeId: 'user-1',
        status: FriendRequestStatus.declined,
      });

      await expect(service.accept('req-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('accepts a pending request addressed to you', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        addresseeId: 'user-1',
        status: FriendRequestStatus.pending,
      });
      prisma.friendRequest.update.mockResolvedValue({
        id: 'req-1',
        status: FriendRequestStatus.accepted,
      });

      await service.accept('req-1', 'user-1');

      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: {
          status: FriendRequestStatus.accepted,
          respondedAt: expect.any(Date),
        },
      });
    });

    it('declines a pending request addressed to you', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        addresseeId: 'user-1',
        status: FriendRequestStatus.pending,
      });
      prisma.friendRequest.update.mockResolvedValue({
        id: 'req-1',
        status: FriendRequestStatus.declined,
      });

      await service.decline('req-1', 'user-1');

      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: {
          status: FriendRequestStatus.declined,
          respondedAt: expect.any(Date),
        },
      });
    });
  });

  describe('getFriendIds', () => {
    it('resolves to the other side of each accepted request', async () => {
      prisma.friendRequest.findMany.mockResolvedValue([
        { requesterId: 'user-1', addresseeId: 'user-2' },
        { requesterId: 'user-3', addresseeId: 'user-1' },
      ]);

      const ids = await service.getFriendIds('user-1');

      expect(ids.sort()).toEqual(['user-2', 'user-3']);
    });
  });

  describe('areFriends', () => {
    it('returns true when an accepted request exists in either direction', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue({ id: 'req-1' });

      await expect(service.areFriends('user-1', 'user-2')).resolves.toBe(true);
    });

    it('returns false when no accepted request exists', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue(null);

      await expect(service.areFriends('user-1', 'user-2')).resolves.toBe(false);
    });
  });

  describe('getConnectionStatus', () => {
    it('reports no connection when nothing exists between the two users', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.getConnectionStatus('user-1', 'user-2'),
      ).resolves.toEqual({
        isFriend: false,
        requestSent: false,
        requestReceived: false,
      });
    });

    it('reports isFriend for an accepted request', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue({
        requesterId: 'user-1',
        addresseeId: 'user-2',
        status: FriendRequestStatus.accepted,
      });

      await expect(
        service.getConnectionStatus('user-1', 'user-2'),
      ).resolves.toEqual({
        isFriend: true,
        requestSent: false,
        requestReceived: false,
      });
    });

    it('reports requestSent when the viewer is the requester of a pending request', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue({
        requesterId: 'user-1',
        addresseeId: 'user-2',
        status: FriendRequestStatus.pending,
      });

      await expect(
        service.getConnectionStatus('user-1', 'user-2'),
      ).resolves.toEqual({
        isFriend: false,
        requestSent: true,
        requestReceived: false,
      });
    });

    it('reports requestReceived when the viewer is the addressee of a pending request', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue({
        requesterId: 'user-2',
        addresseeId: 'user-1',
        status: FriendRequestStatus.pending,
      });

      await expect(
        service.getConnectionStatus('user-1', 'user-2'),
      ).resolves.toEqual({
        isFriend: false,
        requestSent: false,
        requestReceived: true,
      });
    });
  });

  describe('unfriend', () => {
    it('rejects if no accepted friendship exists', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue(null);

      await expect(service.unfriend('user-1', 'user-2')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('deletes the accepted friend request', async () => {
      prisma.friendRequest.findFirst.mockResolvedValue({ id: 'req-1' });

      await service.unfriend('user-1', 'user-2');

      expect(prisma.friendRequest.delete).toHaveBeenCalledWith({
        where: { id: 'req-1' },
      });
    });
  });
});
