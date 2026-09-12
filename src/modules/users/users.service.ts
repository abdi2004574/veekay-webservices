import { Injectable, Logger } from '@nestjs/common';
import {
  CampaignPrivacy,
  CampaignStatus,
  NotificationType,
  ProfileVisibility,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { TripRequestStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { FriendsService } from '../friends/friends.service';
import { TokenService } from '../auth/token.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';
import { VerifiedBadgesService } from '../verified-badges/verified-badges.service';
import { ProfileSetupDto } from './dto/profile-setup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import {
  AdminUserFilterDto,
  AdminUserStatus,
} from './dto/admin-user-filter.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  decodeCursor,
  toCursorPage,
} from '../../common/utils/cursor-pagination.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
    private readonly tokenService: TokenService,
    private readonly notificationsService: NotificationsService,
    private readonly adminAuditLogService: AdminAuditLogService,
    private readonly verifiedBadgesService: VerifiedBadgesService,
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
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    const prefMap = new Map(prefs.map((p) => [p.type, p]));

    return (Object.values(NotificationType) as NotificationType[]).map(
      (type) => {
        const existing = prefMap.get(type);
        return {
          type,
          inAppEnabled: existing?.inAppEnabled ?? true,
          pushEnabled: existing?.pushEnabled ?? true,
          emailEnabled: existing?.emailEnabled ?? false,
        };
      },
    );
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const type = dto.type ?? NotificationType.donation;

    const updateData: Record<string, boolean> = {};
    if (dto.inAppEnabled !== undefined)
      updateData.inAppEnabled = dto.inAppEnabled;
    if (dto.pushEnabled !== undefined) updateData.pushEnabled = dto.pushEnabled;
    if (dto.emailEnabled !== undefined)
      updateData.emailEnabled = dto.emailEnabled;

    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: {
        userId,
        type,
        inAppEnabled: dto.inAppEnabled ?? true,
        pushEnabled: dto.pushEnabled ?? true,
        emailEnabled: dto.emailEnabled ?? false,
      },
      update: updateData,
    });
    return {
      type: prefs.type,
      inAppEnabled: prefs.inAppEnabled,
      pushEnabled: prefs.pushEnabled,
      emailEnabled: prefs.emailEnabled,
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

  async updateKyc(userId: string, dto: UpdateKycDto) {
    const profile = await this.prisma.travelerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw AppException.notFound('Traveler profile not found.');
    }

    const updateData: any = {};
    if (dto.governmentIdMediaId !== undefined) {
      updateData.governmentIdMediaId = dto.governmentIdMediaId;
    }

    if (dto.dateOfBirth) {
      const birthDate = new Date(dto.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      updateData.dateOfBirth = birthDate;
      updateData.isAdult = age >= 18;
      updateData.requiresAccompaniment = age < 18;
    }

    if (dto.isAdult !== undefined) {
      updateData.isAdult = dto.isAdult;
    }
    if (dto.requiresAccompaniment !== undefined) {
      updateData.requiresAccompaniment = dto.requiresAccompaniment;
    }

    updateData.verificationStatus = VerificationStatus.pending_review;

    const updated = await this.prisma.travelerProfile.update({
      where: { userId },
      data: updateData,
    });

    this.logger.log(
      JSON.stringify({
        audit: 'traveler.kyc.submitted',
        actorUserId: userId,
      }),
    );

    return updated;
  }

  async verifyKyc(
    targetUserId: string,
    status: VerificationStatus,
    note?: string,
    actorUserId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { travelerProfile: true },
    });
    if (!user || !user.travelerProfile) {
      throw AppException.notFound('Traveler profile not found.');
    }

    const updateData: any = {
      verificationStatus: status,
      identityVerified: status === VerificationStatus.verified,
    };

    const updated = await this.prisma.travelerProfile.update({
      where: { userId: targetUserId },
      data: updateData,
    });

    await this.adminAuditLogService.record(
      actorUserId ?? '',
      status === VerificationStatus.verified ? 'kyc.verified' : 'kyc.rejected',
      'user',
      targetUserId,
      note,
    );
    try {
      await this.notificationsService.create(targetUserId, {
        type: NotificationType.verification_status,
        title:
          status === VerificationStatus.verified
            ? 'Identity Verified'
            : 'Verification Update',
        body:
          status === VerificationStatus.verified
            ? 'Your identity has been verified. You can now make high-value withdrawals.'
            : 'Your identity verification was not approved. Reason: ' +
              (note ?? 'Not specified'),
        deepLinkTarget: 'profile',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send verification_status notification for user ${targetUserId}: ${(error as Error).message}`,
      );
    }

    if (status !== VerificationStatus.verified) {
      try {
        const badge = await this.verifiedBadgesService.findActiveBySubject(
          'user',
          targetUserId,
        );
        if (badge) {
          await this.verifiedBadgesService.revoke(actorUserId ?? '', badge.id);
        }
      } catch (error) {
        // ignore
      }
    }

    return updated;
  }

  async getTopPerformingTravelers(limit = 10) {
    const travelers = await this.prisma.user.findMany({
      where: { role: UserRole.traveler },
      select: {
        id: true,
        username: true,
        displayName: true,
        travelerProfile: {
          select: { photoMediaId: true },
        },
      },
    });

    const results = await Promise.all(
      travelers.map(async (traveler) => {
        const completedTrips = await this.prisma.tripRequest.count({
          where: {
            travelerId: traveler.id,
            status: TripRequestStatus.completed,
          },
        });
        return {
          id: traveler.id,
          username: traveler.username,
          displayName: traveler.displayName,
          photoMediaId: traveler.travelerProfile?.photoMediaId ?? null,
          completedTripCount: completedTrips,
        };
      }),
    );

    return results
      .filter((t) => t.completedTripCount >= 3)
      .sort((a, b) => b.completedTripCount - a.completedTripCount)
      .slice(0, limit);
  }
  private toAdminUserSummary(user: any) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? user.username ?? user.email,
      role: user.platformRole === 'super_admin' ? 'super_admin' : user.role,
      platformRole: user.platformRole,
      isActive: user.isActive,
      ...(user.deactivatedAt ? { deactivatedAt: user.deactivatedAt } : {}),
      createdAt: user.createdAt,
      ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
      ...(user.travelerProfile
        ? {
            profile: {
              bio: user.travelerProfile.bio ?? undefined,
              location: user.travelerProfile.location ?? undefined,
              badge: user.travelerProfile.badge,
              walletConnected: user.travelerProfile.walletConnected,
            },
          }
        : {}),
    };
  }

  async listAdminUsers(
    filter: AdminUserFilterDto,
    cursor?: string,
    limit = 20,
  ) {
    const position = decodeCursor(cursor);
    const search = filter.search?.trim();
    const where: any = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.status === AdminUserStatus.active ? { isActive: true } : {}),
      ...(filter.status === AdminUserStatus.deactivated
        ? { isActive: false }
        : {}),
    };

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        role: true,
        platformRole: true,
        isActive: true,
        deactivatedAt: true,
        createdAt: true,
        lastLoginAt: true,
        travelerProfile: {
          select: {
            bio: true,
            location: true,
            badge: true,
            walletConnected: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(position
        ? {
            cursor: { createdAt: position.createdAt, id: position.id },
            skip: 1,
          }
        : {}),
    });
    const page = toCursorPage(users, limit);

    return {
      data: page.items.map((user) => this.toAdminUserSummary(user)),
      meta: { cursor: page.cursor, hasMore: page.hasMore },
    };
  }

  async getAdminUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { travelerProfile: true },
    });
    if (!user) {
      throw AppException.notFound('User not found.');
    }

    const [campaignsCreated, campaignsFunded, donationsMade] =
      await Promise.all([
        this.prisma.campaign.count({ where: { creatorId: userId } }),
        this.prisma.campaign.count({
          where: { creatorId: userId, status: CampaignStatus.funded },
        }),
        this.prisma.donation.count({ where: { donorUserId: userId } }),
      ]);

    return {
      ...this.toAdminUserSummary(user),
      stats: { campaignsCreated, campaignsFunded, donationsMade },
    };
  }

  async updateAdminUserStatus(
    userId: string,
    dto: UpdateUserStatusDto,
    actorUserId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppException.notFound('User not found.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: dto.isActive,
        deactivatedAt: dto.isActive ? null : new Date(),
      },
    });

    if (!dto.isActive) {
      await this.tokenService.revokeAllRefreshTokensForUser(userId);
    }

    await this.adminAuditLogService.record(
      actorUserId,
      dto.isActive ? 'user.activated' : 'user.deactivated',
      'user',
      userId,
      undefined,
      { previousIsActive: user.isActive, newIsActive: dto.isActive },
    );

    return this.toAdminUserSummary(updated);
  }

  async deactivateAccount(userId: string) {
    try {
      await this.notificationsService.create(userId, {
        type: 'account_status',
        title: 'Account Deactivated',
        body: 'Your account has been deactivated. You can reactivate it by contacting support.',
        deepLinkTarget: 'settings',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send account_status notification for user ${userId}: ${(error as Error).message}`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await this.tokenService.revokeAllRefreshTokensForUser(userId);
  }
}
