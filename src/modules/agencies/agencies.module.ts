import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { AgenciesController } from './agencies.controller';
import { AgenciesStaffController } from './agencies-staff.controller';
import { AdminAgenciesController } from './admin-agencies.controller';
import { AgencyDirectoryController } from './agency-directory.controller';
import { AgencyDashboardController } from './agency-dashboard.controller';
import { AgenciesService } from './agencies.service';
import { AgenciesStaffService } from './agencies-staff.service';
import { AgencyDashboardService } from './dashboard.service';
import { AgencyRevenueService } from './revenue.service';
import { AgencyVerificationReminderProcessor } from './processors/agency-verification-reminder.processor';
import { RevenueCatWebhookController } from './revenuecat-webhook.controller';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
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
    NotificationsModule,
    AdminAuditLogModule,
    ConfigModule,
    BullModule.registerQueueAsync({
      name: 'moderation',
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: parseRedisUrl(config.get('redis.url', { infer: true })),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AgenciesController,
    AgenciesStaffController,
    AgencyDirectoryController,
    AdminAgenciesController,
    AgencyDashboardController,
    RevenueCatWebhookController,
  ],
  providers: [
    AgenciesService,
    AgenciesStaffService,
    AgencyDashboardService,
    AgencyRevenueService,
    AgencyVerificationReminderProcessor,
    RevenueCatWebhookService,
  ],
  exports: [
    AgenciesService,
    AgenciesStaffService,
    AgencyDashboardService,
    AgencyRevenueService,
  ],
})
export class AgenciesModule {}
