import { Injectable } from '@nestjs/common';
import { CampaignPrivacy, ProfileVisibility, UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { TokenService } from '../auth/token.service';
import { ProfileSetupDto } from './dto/profile-setup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
    private readonly tokenService: TokenService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        travelerProfile: {
          include: { destinationTypes: true, travelStyles: true },
        },
      },
    });
    if (!user) {
      throw AppException.notFound('User not found.');
    }

    const [friendsCount, postsCount, campaignsCount] = await Promise.all([
      user.role === UserRole.traveler
        ? this.friendsService.getFriendIds(userId).then((ids) => ids.length)
        : Promise.resolve(0),
      this.prisma.post.count({ where: { authorId: userId } }),
      this.prisma.campaign.count({ where: { creatorId: userId } }),
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
      phone: user.travelerProfile?.phone ?? null,
      photoMediaId: user.travelerProfile?.photoMediaId ?? null,
      badge: user.travelerProfile?.badge ?? null,
      gender: user.travelerProfile?.gender ?? null,
      dateOfBirth: user.travelerProfile?.dateOfBirth ?? null,
      destinationTypes: (user.travelerProfile?.destinationTypes ?? []).map(
        (d) => d.destinationType,
      ),
      travelStyles: (user.travelerProfile?.travelStyles ?? []).map(
        (t) => t.travelStyle,
      ),
      friendsCount,
      postsCount,
      campaignsCount,
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
    const [
      friendsCount,
      postsCount,
      campaignsCount,
      connectionStatus,
      mutualFriendsCount,
      privacySetting,
    ] = await Promise.all([
      this.friendsService.getFriendIds(targetUserId).then((ids) => ids.length),
      this.prisma.post.count({ where: { authorId: targetUserId } }),
      this.prisma.campaign.count({
        where: {
          creatorId: targetUserId,
          ...(isSelf ? {} : { privacy: CampaignPrivacy.public }),
        },
      }),
      isSelf
        ? Promise.resolve({
            isFriend: false,
            requestSent: false,
            requestReceived: false,
          })
        : this.friendsService.getConnectionStatus(viewerId, targetUserId),
      isSelf
        ? Promise.resolve(0)
        : this.friendsService.getMutualFriendsCount(viewerId, targetUserId),
      isSelf
        ? Promise.resolve(null)
        : this.prisma.privacySetting.findUnique({
            where: { userId: targetUserId },
          }),
    ]);

    const visibility =
      privacySetting?.profileVisibility ?? ProfileVisibility.public;
    if (
      !isSelf &&
      (visibility === ProfileVisibility.private ||
        (visibility === ProfileVisibility.friends &&
          !connectionStatus.isFriend))
    ) {
      throw AppException.notFound('Traveler not found.');
    }

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
      campaignsCount,
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
        const status = await this.friendsService.getConnectionStatus(
          viewerId,
          user.id,
        );
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

    const previousTripPhotosCreate = (dto.previousTrips ?? []).map((trip) => ({
      mediaId: trip.mediaId,
      name: trip.name,
      location: trip.location,
      startDate: new Date(trip.startDate),
      endDate: new Date(trip.endDate),
      travelerCount: trip.travelerCount,
      description: trip.description,
    }));

    const profile = await this.prisma.travelerProfile.upsert({
      where: { userId },
      create: {
        userId,
        photoMediaId: dto.photoMediaId,
        bio: dto.bio,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
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
        previousTripPhotos: { create: previousTripPhotosCreate },
      },
      update: {
        photoMediaId: dto.photoMediaId,
        bio: dto.bio,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
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
        previousTripPhotos: { create: previousTripPhotosCreate },
      },
      include: {
        destinationTypes: true,
        travelStyles: true,
        previousTripPhotos: true,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: true },
    });

    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppException.notFound('User not found.');
    }

    if (dto.username && dto.username !== user.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing) {
        throw AppException.conflict('That username is already taken.');
      }
    }

    if (dto.displayName !== undefined || dto.username !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.displayName !== undefined
            ? { displayName: dto.displayName }
            : {}),
          ...(dto.username !== undefined ? { username: dto.username } : {}),
        },
      });
    }

    await this.prisma.travelerProfile.upsert({
      where: { userId },
      create: {
        userId,
        photoMediaId: dto.photoMediaId,
        bio: dto.bio,
        location: dto.location,
        phone: dto.phone,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        ...(dto.destinationTypes
          ? {
              destinationTypes: {
                create: dto.destinationTypes.map((destinationType) => ({
                  destinationType,
                })),
              },
            }
          : {}),
        ...(dto.travelStyles
          ? {
              travelStyles: {
                create: dto.travelStyles.map((travelStyle) => ({
                  travelStyle,
                })),
              },
            }
          : {}),
      },
      update: {
        ...(dto.photoMediaId !== undefined
          ? { photoMediaId: dto.photoMediaId }
          : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.dateOfBirth !== undefined
          ? { dateOfBirth: new Date(dto.dateOfBirth) }
          : {}),
        ...(dto.destinationTypes
          ? {
              destinationTypes: {
                deleteMany: {},
                create: dto.destinationTypes.map((destinationType) => ({
                  destinationType,
                })),
              },
            }
          : {}),
        ...(dto.travelStyles
          ? {
              travelStyles: {
                deleteMany: {},
                create: dto.travelStyles.map((travelStyle) => ({
                  travelStyle,
                })),
              },
            }
          : {}),
      },
    });

    return this.getMe(userId);
  }

  async getNotificationPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return {
      donationAlerts: prefs?.donationAlerts ?? true,
      campaignUpdates: prefs?.campaignUpdates ?? true,
      agencyMessages: prefs?.agencyMessages ?? true,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        donationAlerts: dto.donationAlerts ?? true,
        campaignUpdates: dto.campaignUpdates ?? true,
        agencyMessages: dto.agencyMessages ?? true,
      },
      update: { ...dto },
    });
    return {
      donationAlerts: prefs.donationAlerts,
      campaignUpdates: prefs.campaignUpdates,
      agencyMessages: prefs.agencyMessages,
    };
  }

  async getPrivacySettings(userId: string) {
    const settings = await this.prisma.privacySetting.findUnique({
      where: { userId },
    });
    return {
      profileVisibility:
        settings?.profileVisibility ?? ProfileVisibility.public,
      activityStatusVisible: settings?.activityStatusVisible ?? true,
      readReceiptsEnabled: settings?.readReceiptsEnabled ?? true,
    };
  }

  async updatePrivacySettings(userId: string, dto: UpdatePrivacySettingsDto) {
    const settings = await this.prisma.privacySetting.upsert({
      where: { userId },
      create: {
        userId,
        profileVisibility: dto.profileVisibility ?? ProfileVisibility.public,
        activityStatusVisible: dto.activityStatusVisible ?? true,
        readReceiptsEnabled: dto.readReceiptsEnabled ?? true,
      },
      update: { ...dto },
    });
    return {
      profileVisibility: settings.profileVisibility,
      activityStatusVisible: settings.activityStatusVisible,
      readReceiptsEnabled: settings.readReceiptsEnabled,
    };
  }

  async deactivateAccount(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await this.tokenService.revokeAllRefreshTokensForUser(userId);
  }
}
