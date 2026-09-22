import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ChatCoreModule } from '../chat-core.module';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { ICallProvider } from '../../../common/interfaces/call-provider.interface';
import { NoopCallProvider } from '../../../common/providers/noop-call.provider';

@Module({
  imports: [PrismaModule, NotificationsModule, ChatCoreModule],
  controllers: [CallsController],
  providers: [
    CallsService,
    NoopCallProvider,
    {
      provide: ICallProvider,
      useExisting: NoopCallProvider,
    },
  ],
  exports: [CallsService, ICallProvider],
})
export class CallsModule {}
