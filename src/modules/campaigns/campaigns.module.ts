import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { VerifiedBadgesModule } from '../verified-badges/verified-badges.module';
import { WalletModule } from '../wallet/wallet.module';
import { CampaignsController } from './campaigns.controller';
import { AdminCampaignsController } from './admin-campaigns.controller';
import { DonateController } from './donate.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignLifecycleService } from './lifecycle.service';

@Module({
  imports: [
    StorageModule,
    AdminAuditLogModule,
    VerifiedBadgesModule,
    WalletModule,
  ],
  controllers: [
    CampaignsController,
    AdminCampaignsController,
    DonateController,
  ],
  providers: [CampaignsService, CampaignLifecycleService],
  exports: [CampaignsService, CampaignLifecycleService],
})
export class CampaignsModule {}
