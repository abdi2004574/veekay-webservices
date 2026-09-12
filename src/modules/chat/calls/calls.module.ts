import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ChatCoreModule } from '../chat-core.module';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { NoopCallProvider } from '../../../common/providers/noop-call.provider';
import { CALL_PROVIDER } from '../../../common/interfaces/call-provider.interface';

@Module({
  imports: [PrismaModule, NotificationsModule, ChatCoreModule],
  controllers: [CallsController],
  providers: [
    CallsService,
    NoopCallProvider,
    { provide: CALL_PROVIDER, useExisting: NoopCallProvider },
  ],
  exports: [CallsService],
})
export class CallsModule {}
