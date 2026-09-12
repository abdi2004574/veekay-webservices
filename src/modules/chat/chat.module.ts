import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsModule } from './calls/calls.module';
import { ChatCoreModule } from './chat-core.module';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [StorageModule, NotificationsModule, CallsModule, ChatCoreModule],
  controllers: [ConversationsController, MessagesController],
  providers: [MessagesService],
  exports: [ChatCoreModule, MessagesService],
})
export class ChatModule {}
