import {
  DestinationType,
  Gender,
  ProfileVisibility,
  TravelStyle,
  UserRole,
} from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: any;
  let friendsService: any;
  let tokenService: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      travelerDestinationPreference: { deleteMany: jest.fn() },
      travelerTravelStylePreference: { deleteMany: jest.fn() },
      travelerPreviousTripPhoto: { deleteMany: jest.fn() },
      travelerProfile: { upsert: jest.fn() },
      notificationPreference: { findUnique: jest.fn(), upsert: jest.fn() },
      privacySetting: { findUnique: jest.fn(), upsert: jest.fn() },
      post: { count: jest.fn() },
      campaign: { count: jest.fn().mockResolvedValue(0) },
    };
    friendsService = {
      getFriendIds: jest.fn().mockResolvedValue([]),
      areFriends: jest.fn().mockResolvedValue(false),
      getMutualFriendsCount: jest.fn().mockResolvedValue(0),
      getConnectionStatus: jest.fn().mockResolvedValue({
        isFriend: false,
        requestSent: false,
        requestReceived: false,
      }),
    };
    tokenService = {
      revokeAllRefreshTokensForUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(prisma, friendsService, tokenService);
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

  it('persists gender, date of birth, bio, and full previous-trip metadata, and succeeds without a photo', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.traveler,
    });
    prisma.travelerProfile.upsert.mockResolvedValue({});

    await service.setupProfile('user-1', {
      destinationTypes: [DestinationType.beach],
      travelStyles: [TravelStyle.solo],
      gender: Gender.female,
      dateOfBirth: '1995-04-12',
      bio: 'Loves the mountains.',
      previousTrips: [
        {
          mediaId: 'media-trip-1',
          name: 'Swiss Alps',
          location: 'Zermatt, Switzerland',
          startDate: '2023-01-05',
          endDate: '2023-01-12',
          travelerCount: 2,
          description: 'First ski trip.',
        },
      ],
    });

    const upsertArgs = prisma.travelerProfile.upsert.mock.calls[0][0];
    expect(upsertArgs.create.photoMediaId).toBeUndefined();
    expect(upsertArgs.create.gender).toBe(Gender.female);
    expect(upsertArgs.create.dateOfBirth).toEqual(new Date('1995-04-12'));
    expect(upsertArgs.create.bio).toBe('Loves the mountains.');
    expect(upsertArgs.create.previousTripPhotos.create).toEqual([
      {
        mediaId: 'media-trip-1',
        name: 'Swiss Alps',
        location: 'Zermatt, Switzerland',
        startDate: new Date('2023-01-05'),
        endDate: new Date('2023-01-12'),
        travelerCount: 2,
        description: 'First ski trip.',
      },
    ]);
  });

  describe('updateProfile', () => {
    const baseUser = {
      id: 'user-1',
      username: 'alice',
      role: UserRole.traveler,
      travelerProfile: null,
    };

    it('updates only the fields provided, leaving everything else untouched', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.travelerProfile.upsert.mockResolvedValue({});
      prisma.post.count.mockResolvedValue(0);

      await service.updateProfile('user-1', { bio: 'new bio' });

      const upsertArgs = prisma.travelerProfile.upsert.mock.calls[0][0];
      expect(upsertArgs.update).toEqual({ bio: 'new bio' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the chosen username is already taken by someone else', async () => {
      prisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id) return Promise.resolve(baseUser);
        if (where.username === 'bob')
          return Promise.resolve({ id: 'user-2', username: 'bob' });
        return Promise.resolve(null);
      });

      await expect(
        service.updateProfile('user-1', { username: 'bob' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('updates displayName and username on User when provided and free', async () => {
      prisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id) return Promise.resolve(baseUser);
        if (where.username === 'newname') return Promise.resolve(null);
        return Promise.resolve(null);
      });
      prisma.travelerProfile.upsert.mockResolvedValue({});
      prisma.post.count.mockResolvedValue(0);

      await service.updateProfile('user-1', {
        username: 'newname',
        displayName: 'New Name',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { displayName: 'New Name', username: 'newname' },
      });
    });

    it('only replaces destinationTypes/travelStyles child rows when their array is present in the request', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.travelerProfile.upsert.mockResolvedValue({});
      prisma.post.count.mockResolvedValue(0);

      await service.updateProfile('user-1', {
        destinationTypes: [DestinationType.city],
      });

      const upsertArgs = prisma.travelerProfile.upsert.mock.calls[0][0];
      expect(upsertArgs.update.destinationTypes).toEqual({
        deleteMany: {},
        create: [{ destinationType: DestinationType.city }],
      });
      expect(upsertArgs.update).not.toHaveProperty('travelStyles');
    });
  });

  describe('notification preferences', () => {
    it('returns schema defaults when no preference row exists yet', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      const prefs = await service.getNotificationPreferences('user-1');

      expect(prefs).toEqual({
        donationAlerts: true,
        campaignUpdates: true,
        agencyMessages: true,
      });
    });

    it('upserts and returns the updated values', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({
        donationAlerts: false,
        campaignUpdates: true,
        agencyMessages: true,
      });

      const prefs = await service.updateNotificationPreferences('user-1', {
        donationAlerts: false,
      });

      expect(prefs.donationAlerts).toBe(false);
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
  });

  describe('privacy settings', () => {
    it('returns schema defaults when no settings row exists yet', async () => {
      prisma.privacySetting.findUnique.mockResolvedValue(null);

      const settings = await service.getPrivacySettings('user-1');

      expect(settings).toEqual({
        profileVisibility: ProfileVisibility.public,
        activityStatusVisible: true,
        readReceiptsEnabled: true,
      });
    });

    it('upserts and returns the updated values', async () => {
      prisma.privacySetting.upsert.mockResolvedValue({
        profileVisibility: ProfileVisibility.private,
        activityStatusVisible: true,
        readReceiptsEnabled: true,
      });

      const settings = await service.updatePrivacySettings('user-1', {
        profileVisibility: ProfileVisibility.private,
      });

      expect(settings.profileVisibility).toBe(ProfileVisibility.private);
    });
  });

  describe('deactivateAccount', () => {
    it('marks the user inactive, stamps deactivatedAt, and revokes all refresh tokens', async () => {
      await service.deactivateAccount('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false, deactivatedAt: expect.any(Date) },
      });
      expect(tokenService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(
        'user-1',
      );
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
        travelerProfile: {
          bio: 'hi',
          location: 'NYC',
          photoMediaId: 'media-1',
          badge: 'dreamer',
          gender: Gender.female,
          dateOfBirth: new Date('1995-04-12'),
        },
      });
      friendsService.getFriendIds.mockResolvedValue(['user-2', 'user-3']);
      prisma.post.count.mockResolvedValue(4);
      prisma.campaign.count.mockResolvedValue(2);

      const me = await service.getMe('user-1');

      expect(me.friendsCount).toBe(2);
      expect(me.postsCount).toBe(4);
      expect(me.campaignsCount).toBe(2);
      expect(me.bio).toBe('hi');
      expect(me.badge).toBe('dreamer');
      expect(me.gender).toBe(Gender.female);
      expect(me.dateOfBirth).toEqual(new Date('1995-04-12'));
      expect(prisma.campaign.count).toHaveBeenCalledWith({
        where: { creatorId: 'user-1' },
      });
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
      prisma.user.findUnique.mockResolvedValue({
        id: 'agency-1',
        role: UserRole.agency,
      });

      await expect(
        service.getPublicProfile('user-1', 'agency-1'),
      ).rejects.toMatchObject({
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
      prisma.campaign.count.mockResolvedValue(5);

      const profile = await service.getPublicProfile('user-1', 'user-2');

      expect(profile.isSelf).toBe(false);
      expect(profile.requestSent).toBe(true);
      expect(profile.mutualFriendsCount).toBe(3);
      expect(profile.campaignsCount).toBe(5);
      expect(prisma.campaign.count).toHaveBeenCalledWith({
        where: { creatorId: 'user-2', privacy: 'public' },
      });
    });

    it('counts all of your own campaigns (including private) when viewing your own profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice',
        role: UserRole.traveler,
        travelerProfile: null,
      });
      prisma.post.count.mockResolvedValue(0);
      prisma.campaign.count.mockResolvedValue(3);

      const profile = await service.getPublicProfile('user-1', 'user-1');

      expect(profile.campaignsCount).toBe(3);
      expect(prisma.campaign.count).toHaveBeenCalledWith({
        where: { creatorId: 'user-1' },
      });
    });

    it('blocks a stranger from viewing a private profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        username: 'bob',
        displayName: 'Bob',
        role: UserRole.traveler,
        travelerProfile: null,
      });
      prisma.post.count.mockResolvedValue(0);
      prisma.privacySetting.findUnique.mockResolvedValue({
        profileVisibility: ProfileVisibility.private,
      });

      await expect(
        service.getPublicProfile('user-1', 'user-2'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('blocks a non-friend from a friends-only profile, but allows a friend', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        username: 'bob',
        displayName: 'Bob',
        role: UserRole.traveler,
        travelerProfile: null,
      });
      prisma.post.count.mockResolvedValue(0);
      prisma.privacySetting.findUnique.mockResolvedValue({
        profileVisibility: ProfileVisibility.friends,
      });
      friendsService.getConnectionStatus.mockResolvedValue({
        isFriend: false,
        requestSent: false,
        requestReceived: false,
      });

      await expect(
        service.getPublicProfile('user-1', 'user-2'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });

      friendsService.getConnectionStatus.mockResolvedValue({
        isFriend: true,
        requestSent: false,
        requestReceived: false,
      });

      const profile = await service.getPublicProfile('user-1', 'user-2');
      expect(profile.username).toBe('bob');
    });

    it('never blocks self, regardless of their own privacy setting', async () => {
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
      expect(prisma.privacySetting.findUnique).not.toHaveBeenCalled();
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
