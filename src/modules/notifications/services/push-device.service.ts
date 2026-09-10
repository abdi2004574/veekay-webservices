import { Injectable } from '@nestjs/common';
import type { PushDevice } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../../common/errors/app.exception';

@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    fcmToken: string,
    platform: string,
  ): Promise<PushDevice> {
    const now = new Date();
    return this.prisma.pushDevice.upsert({
      where: { fcmToken },
      create: {
        userId,
        fcmToken,
        platform,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform,
        lastSeenAt: now,
      },
    });
  }

  async unregister(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({
      where: { userId, fcmToken },
    });
  }

  async unregisterById(deviceId: string, userId: string): Promise<void> {
    const result = await this.prisma.pushDevice.deleteMany({
      where: { id: deviceId, userId },
    });
    if (result.count === 0) {
      throw AppException.notFound('Push device not found.');
    }
  }

  async listForUser(userId: string): Promise<PushDevice[]> {
    return this.prisma.pushDevice.findMany({
      where: { userId },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getActiveTokensForUser(userId: string): Promise<string[]> {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId },
      select: { fcmToken: true },
    });
    return devices.map((device) => device.fcmToken);
  }

  async touch(fcmToken: string): Promise<void> {
    await this.prisma.pushDevice.updateMany({
      where: { fcmToken },
      data: { lastSeenAt: new Date() },
    });
  }

  async removeStaleTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) {
      return 0;
    }
    const result = await this.prisma.pushDevice.deleteMany({
      where: { fcmToken: { in: tokens } },
    });
    return result.count;
  }
}
