import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { VerifiedBadgesModule } from '../verified-badges/verified-badges.module';
import { CampaignsController } from './campaigns.controller';
import { AdminCampaignsController } from './admin-campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [StorageModule, AdminAuditLogModule, VerifiedBadgesModule],
  controllers: [CampaignsController, AdminCampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}