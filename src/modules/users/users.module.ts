import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UserProfileController } from './user-profile.controller';
import { UsersService } from './users.service';

@Module({
  imports: [FriendsModule, AuthModule],
  controllers: [UsersController, UserProfileController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
