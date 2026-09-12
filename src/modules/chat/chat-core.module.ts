import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FriendsModule } from '../friends/friends.module';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [PrismaModule, FriendsModule],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ChatCoreModule {}
