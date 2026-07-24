import { DestinationType, TravelStyle, UserRole } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: any;
  let friendsService: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      travelerDestinationPreference: { deleteMany: jest.fn() },
      travelerTravelStylePreference: { deleteMany: jest.fn() },
      travelerPreviousTripPhoto: { deleteMany: jest.fn() },
      travelerProfile: { upsert: jest.fn() },
      post: { count: jest.fn() },
    };
    friendsService = {
      getFriendIds: jest.fn().mockResolvedValue([]),
      areFriends: jest.fn().mockResolvedValue(false),
      getMutualFriendsCount: jest.fn().mockResolvedValue(0),
      getConnectionStatus: jest
        .fn()
        .mockResolvedValue({ isFriend: false, requestSent: false, requestReceived: false }),
    };
    service = new UsersService(prisma, friendsService);
  });

  it('rejects profile setup for a non-traveler account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.agency,
    });

    await expect(
      service.setupProfile('user-1', {
        photoMediaId: 'media-1',
        destinationTypes: [DestinationType.beach],
        travelStyles: [TravelStyle.solo],
      }),
    ).rejects.toMatchObject({ getStatus: expect.any(Function) });
  });

  it('defaults new travelers to the Dreamer badge via the schema default, and completes onboarding', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.traveler,
    });
    prisma.travelerProfile.upsert.mockResolvedValue({
      userId: 'user-1',
      badge: 'dreamer',
    });

    const profile = await service.setupProfile('user-1', {
      photoMediaId: 'media-1',
      destinationTypes: [DestinationType.beach, DestinationType.mountain],
      travelStyles: [TravelStyle.solo],
    });

    expect(profile.badge).toEqual('dreamer');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { onboardingComplete: true },
    });
  });

  it('marks walletConnected true only when a wallet payment method is provided', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.traveler,
    });
    prisma.travelerProfile.upsert.mockResolvedValue({});

    await service.setupProfile('user-1', {
      photoMediaId: 'media-1',
      destinationTypes: [DestinationType.beach],
      travelStyles: [TravelStyle.solo],
      walletPaymentMethodId: 'wallet-123',
    });

    const upsertArgs = prisma.travelerProfile.upsert.mock.calls[0][0];
    expect(upsertArgs.create.walletConnected).toBe(true);
    expect(upsertArgs.update.walletConnected).toBe(true);
  });

  it('replaces prior preference rows rather than accumulating duplicates', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.traveler,
    });
    prisma.travelerProfile.upsert.mockResolvedValue({});

    await service.setupProfile('user-1', {
      photoMediaId: 'media-1',
      destinationTypes: [DestinationType.beach],
      travelStyles: [TravelStyle.solo],
    });

    expect(
      prisma.travelerDestinationPreference.deleteMany,
    ).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(
      prisma.travelerTravelStylePreference.deleteMany,
    ).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  describe('getMe', () => {
    it('throws not-found when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns traveler profile fields plus friends/posts counts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@e2e.test',
        username: 'alice',
        displayName: 'Alice',
        role: UserRole.traveler,
        isEmailVerified: true,
        onboardingComplete: true,
        travelerProfile: { bio: 'hi', location: 'NYC', photoMediaId: 'media-1', badge: 'dreamer' },
      });
      friendsService.getFriendIds.mockResolvedValue(['user-2', 'user-3']);
      prisma.post.count.mockResolvedValue(4);

      const me = await service.getMe('user-1');

      expect(me.friendsCount).toBe(2);
      expect(me.postsCount).toBe(4);
      expect(me.bio).toBe('hi');
      expect(me.badge).toBe('dreamer');
    });

    it('does not resolve friend ids for a non-traveler account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'agency-1',
        role: UserRole.agency,
        travelerProfile: null,
      });
      prisma.post.count.mockResolvedValue(0);

      const me = await service.getMe('agency-1');

      expect(me.friendsCount).toBe(0);
      expect(friendsService.getFriendIds).not.toHaveBeenCalled();
    });
  });

  describe('getPublicProfile', () => {
    it('throws not-found for a non-traveler or missing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'agency-1', role: UserRole.agency });

      await expect(service.getPublicProfile('user-1', 'agency-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('skips connection-status lookups when viewing your own profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice',
        role: UserRole.traveler,
        travelerProfile: null,
      });
      prisma.post.count.mockResolvedValue(0);

      const profile = await service.getPublicProfile('user-1', 'user-1');

      expect(profile.isSelf).toBe(true);
      expect(profile.isFriend).toBe(false);
      expect(friendsService.getConnectionStatus).not.toHaveBeenCalled();
      expect(friendsService.getMutualFriendsCount).not.toHaveBeenCalled();
    });

    it('includes connection status and mutual friends count for another traveler', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        username: 'bob',
        displayName: 'Bob',
        role: UserRole.traveler,
        travelerProfile: null,
      });
      prisma.post.count.mockResolvedValue(0);
      friendsService.getConnectionStatus.mockResolvedValue({
        isFriend: false,
        requestSent: true,
        requestReceived: false,
      });
      friendsService.getMutualFriendsCount.mockResolvedValue(3);

      const profile = await service.getPublicProfile('user-1', 'user-2');

      expect(profile.isSelf).toBe(false);
      expect(profile.requestSent).toBe(true);
      expect(profile.mutualFriendsCount).toBe(3);
    });
  });

  describe('searchTravelers', () => {
    it('returns an empty array for a blank query without hitting the database', async () => {
      const results = await service.searchTravelers('user-1', '   ');

      expect(results).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('excludes the viewer and annotates each result with connection status', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-2',
          username: 'jane',
          displayName: 'Jane',
          travelerProfile: { photoMediaId: 'media-1' },
        },
      ]);
      friendsService.getConnectionStatus.mockResolvedValue({
        isFriend: false,
        requestSent: true,
        requestReceived: false,
      });

      const results = await service.searchTravelers('user-1', 'jane');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'user-1' } }),
        }),
      );
      expect(results).toEqual([
        {
          id: 'user-2',
          username: 'jane',
          displayName: 'Jane',
          photoMediaId: 'media-1',
          isFriend: false,
          requestSent: true,
          requestReceived: false,
        },
      ]);
    });
  });
});
