import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { ProfileSetupDto } from './dto/profile-setup.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { travelerProfile: true },
    });
    if (!user) {
      throw AppException.notFound('User not found.');
    }

    const [friendsCount, postsCount] = await Promise.all([
      user.role === UserRole.traveler
        ? this.friendsService.getFriendIds(userId).then((ids) => ids.length)
        : Promise.resolve(0),
      this.prisma.post.count({ where: { authorId: userId } }),
    ]);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      onboardingComplete: user.onboardingComplete,
      bio: user.travelerProfile?.bio ?? null,
      location: user.travelerProfile?.location ?? null,
      photoMediaId: user.travelerProfile?.photoMediaId ?? null,
      badge: user.travelerProfile?.badge ?? null,
      friendsCount,
      postsCount,
    };
  }

  async getPublicProfile(viewerId: string, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { travelerProfile: true },
    });
    if (!user || user.role !== UserRole.traveler) {
      throw AppException.notFound('Traveler not found.');
    }

    const isSelf = viewerId === targetUserId;
    const [friendsCount, postsCount, connectionStatus, mutualFriendsCount] =
      await Promise.all([
        this.friendsService.getFriendIds(targetUserId).then((ids) => ids.length),
        this.prisma.post.count({ where: { authorId: targetUserId } }),
        isSelf
          ? Promise.resolve({ isFriend: false, requestSent: false, requestReceived: false })
          : this.friendsService.getConnectionStatus(viewerId, targetUserId),
        isSelf
          ? Promise.resolve(0)
          : this.friendsService.getMutualFriendsCount(viewerId, targetUserId),
      ]);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.travelerProfile?.bio ?? null,
      location: user.travelerProfile?.location ?? null,
      photoMediaId: user.travelerProfile?.photoMediaId ?? null,
      badge: user.travelerProfile?.badge ?? null,
      friendsCount,
      postsCount,
      campaignsCount: 0,
      tripsCount: 0,
      isSelf,
      mutualFriendsCount,
      ...connectionStatus,
    };
  }

  async searchTravelers(viewerId: string, query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        role: UserRole.traveler,
        OR: [
          { username: { contains: trimmed, mode: 'insensitive' } },
          { displayName: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      take: 20,
      include: { travelerProfile: { select: { photoMediaId: true } } },
    });

    return Promise.all(
      users.map(async (user) => {
        const status = await this.friendsService.getConnectionStatus(viewerId, user.id);
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          photoMediaId: user.travelerProfile?.photoMediaId ?? null,
          ...status,
        };
      }),
    );
  }

  async setupProfile(userId: string, dto: ProfileSetupDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.traveler) {
      throw AppException.forbidden(
        'Only travelers can set up a traveler profile.',
      );
    }

    await this.prisma.travelerDestinationPreference.deleteMany({
      where: { userId },
    });
    await this.prisma.travelerTravelStylePreference.deleteMany({
      where: { userId },
    });
    await this.prisma.travelerPreviousTripPhoto.deleteMany({
      where: { userId },
    });

    const profile = await this.prisma.travelerProfile.upsert({
      where: { userId },
      create: {
        userId,
        photoMediaId: dto.photoMediaId,
        walletConnected: !!dto.walletPaymentMethodId,
        walletPaymentMethodId: dto.walletPaymentMethodId,
        destinationTypes: {
          create: dto.destinationTypes.map((destinationType) => ({
            destinationType,
          })),
        },
        travelStyles: {
          create: dto.travelStyles.map((travelStyle) => ({ travelStyle })),
        },
        previousTripPhotos: {
          create: (dto.previousTripPhotoIds ?? []).map((mediaId) => ({
            mediaId,
          })),
        },
      },
      update: {
        photoMediaId: dto.photoMediaId,
        walletConnected: !!dto.walletPaymentMethodId,
        walletPaymentMethodId: dto.walletPaymentMethodId,
        destinationTypes: {
          create: dto.destinationTypes.map((destinationType) => ({
            destinationType,
          })),
        },
        travelStyles: {
          create: dto.travelStyles.map((travelStyle) => ({ travelStyle })),
        },
        previousTripPhotos: {
          create: (dto.previousTripPhotoIds ?? []).map((mediaId) => ({
            mediaId,
          })),
        },
      },
      include: { destinationTypes: true, travelStyles: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: true },
    });

    return profile;
  }
}
