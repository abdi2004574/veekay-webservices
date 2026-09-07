import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManualFundingProvider } from './funding/manual-funding.provider';
import { FUNDING_PROVIDER } from './interfaces/funding-provider.interface';
import { AdminWalletController } from './admin-wallet.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController, AdminWalletController],
  providers: [
    WalletService,
    ManualFundingProvider,
    {
      provide: FUNDING_PROVIDER,
      useExisting: ManualFundingProvider,
    },
  ],
  exports: [WalletService, FUNDING_PROVIDER],
})
export class WalletModule {}