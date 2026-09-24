import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { ManualFundingProvider } from './funding/manual-funding.provider';
import { RevenueCatFundingProvider } from './funding/revenue-cat-funding.provider';
import { AppConfig } from '../../config/configuration';
import { FUNDING_PROVIDER } from './interfaces/funding-provider.interface';
import type { IFundingProvider } from './interfaces/funding-provider.interface';
import { AdminWalletController } from './admin-wallet.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

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
    RevenueCatFundingProvider,
    {
      provide: FUNDING_PROVIDER,
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        manualProvider: ManualFundingProvider,
        revenuecatProvider: RevenueCatFundingProvider,
      ): IFundingProvider => {
        const provider =
          configService.get<string>('wallet.fundingProvider', {
            infer: true,
          }) ?? 'manual';
        switch (provider) {
          case 'revenuecat':
            return revenuecatProvider;
          case 'manual':
          default:
            return manualProvider;
        }
      },
      inject: [ConfigService, ManualFundingProvider, RevenueCatFundingProvider],
    },
  ],
  exports: [WalletService, FUNDING_PROVIDER, RevenueCatFundingProvider],
})
export class WalletModule {}
