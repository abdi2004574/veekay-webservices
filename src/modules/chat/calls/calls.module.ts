import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ChatCoreModule } from '../chat-core.module';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { ICallProvider } from '../../../common/interfaces/call-provider.interface';
import { DailyCallProvider } from '../../../common/providers/daily-call.provider';
import { NoopCallProvider } from '../../../common/providers/noop-call.provider';

const DAILY_API_KEY = 'DAILY_API_KEY';

@Module({
  imports: [PrismaModule, NotificationsModule, ChatCoreModule],
  controllers: [CallsController],
  providers: [
    CallsService,
    NoopCallProvider,
    {
      provide: ICallProvider,
      useFactory: (config: ConfigService) => new DailyCallProvider(config.get(DAILY_API_KEY)!),
      inject: [ConfigService],
    },
  ],
  exports: [CallsService, ICallProvider],
})

export class CallsModule {}