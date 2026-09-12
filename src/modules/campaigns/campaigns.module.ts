import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { StorageModule } from '../storage/storage.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { VerifiedBadgesModule } from '../verified-badges/verified-badges.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CampaignsController } from './campaigns.controller';
import { AdminCampaignsController } from './admin-campaigns.controller';
import { DonateController } from './donate.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignLifecycleService } from './lifecycle.service';
import { CampaignExpiryCheckProcessor } from './processors/campaign-expiry-check.processor';
import { CampaignMilestoneCheckProcessor } from './processors/campaign-milestone-check.processor';
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
    StorageModule,
    AdminAuditLogModule,
    VerifiedBadgesModule,
    WalletModule,
    NotificationsModule,
    ConfigModule,
    BullModule.registerQueueAsync({
      name: 'campaigns',
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: parseRedisUrl(config.get('redis.url', { infer: true })),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    CampaignsController,
    AdminCampaignsController,
    DonateController,
  ],
  providers: [
    CampaignsService,
    CampaignLifecycleService,
    CampaignExpiryCheckProcessor,
    CampaignMilestoneCheckProcessor,
  ],
  exports: [CampaignsService, CampaignLifecycleService],
})
export class CampaignsModule {}
