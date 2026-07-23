import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileSetupDto } from './dto/profile-setup.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
