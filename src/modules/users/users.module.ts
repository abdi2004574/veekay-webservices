import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { UsersController } from './users.controller';
import { UserProfileController } from './user-profile.controller';
import { UsersService } from './users.service';

@Module({
  imports: [FriendsModule],
  controllers: [UsersController, UserProfileController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
