import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { ChatModule } from '../chat/chat.module';
import { StorageModule } from '../storage/storage.module';
import { GroupCampaignsController } from './group-campaigns.controller';
import { GroupTripsController } from './group-trips.controller';
import { GroupCampaignsService } from './group-campaigns.service';

@Module({
  imports: [FriendsModule, ChatModule, StorageModule],
  controllers: [GroupCampaignsController, GroupTripsController],
  providers: [GroupCampaignsService],
})
export class GroupCampaignsModule {}
