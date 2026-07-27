import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { StorageModule } from '../storage/storage.module';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [FriendsModule, StorageModule],
  controllers: [ConversationsController, MessagesController],
  providers: [ConversationsService, MessagesService],
})
export class ChatModule {}
