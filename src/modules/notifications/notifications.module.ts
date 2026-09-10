import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationsController } from './notifications.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationDispatchProcessor } from './processors/notification-dispatch.processor';
import { NotificationsService } from './services/notifications.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { PushDeviceService } from './services/push-device.service';
import { MilestoneNotificationService } from './services/milestone-notification.service';
import { NotificationBroadcastService } from './services/notification-broadcast.service';
import { FirebasePushProvider } from './providers/firebase-push.provider';
import { FIREBASE_PUSH_PROVIDER } from './interfaces/firebase-push.interface';
import { AppConfig } from '../../config/configuration';

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

@Module({
  imports: [
    PrismaModule,
    MailModule,
    RedisModule,
    ConfigModule,
    BullModule.registerQueueAsync({
      name: 'notifications',
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: parseRedisUrl(config.get('redis.url', { infer: true })),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationsService,
    NotificationPreferenceService,
    PushDeviceService,
    MilestoneNotificationService,
    NotificationBroadcastService,
    NotificationDispatchProcessor,
    FirebasePushProvider,
    {
      provide: FIREBASE_PUSH_PROVIDER,
      useExisting: FirebasePushProvider,
    },
  ],
  exports: [
    NotificationsService,
    NotificationPreferenceService,
    PushDeviceService,
    MilestoneNotificationService,
    NotificationBroadcastService,
  ],
})
export class NotificationsModule {}
