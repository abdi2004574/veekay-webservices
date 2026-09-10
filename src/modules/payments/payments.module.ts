import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { WalletModule } from '../wallet/wallet.module';
import { StripeConnectService } from './stripe-connect.service';
import { StripeWebhookController } from './webhook.controller';
import { AgencyPayoutService } from './agency-payout.service';
import { CommissionService } from './commission.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    NotificationsModule,
    AdminAuditLogModule,
    WalletModule,
  ],
  controllers: [StripeWebhookController],
  providers: [StripeConnectService, AgencyPayoutService, CommissionService],
  exports: [StripeConnectService, AgencyPayoutService, CommissionService],
})
export class PaymentsModule {}
