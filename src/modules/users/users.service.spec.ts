import { DestinationType, TravelStyle, UserRole } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      travelerDestinationPreference: { deleteMany: jest.fn() },
      travelerTravelStylePreference: { deleteMany: jest.fn() },
      travelerPreviousTripPhoto: { deleteMany: jest.fn() },
      travelerProfile: { upsert: jest.fn() },
    };
    service = new UsersService(prisma);
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
});
