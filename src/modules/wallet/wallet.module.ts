import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { ManualFundingProvider } from './funding/manual-funding.provider';
import { StripeFundingProvider } from './funding/stripe-funding.provider';
import { FUNDING_PROVIDER } from './interfaces/funding-provider.interface';
import { AdminWalletController } from './admin-wallet.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { StripeConnectService } from '../payments/stripe-connect.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    NotificationsModule,
    AdminAuditLogModule,
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [
    WalletService,
    ManualFundingProvider,
    StripeFundingProvider,
    StripeConnectService,
    {
      provide: FUNDING_PROVIDER,
      useExisting: StripeFundingProvider,
    },
  ],
  exports: [
    WalletService,
    FUNDING_PROVIDER,
    StripeConnectService,
    StripeFundingProvider,
  ],
})
export class WalletModule {}
