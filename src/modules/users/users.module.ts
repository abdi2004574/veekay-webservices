import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { VerifiedBadgesModule } from '../verified-badges/verified-badges.module';
import { UsersController } from './users.controller';
import { UserProfileController } from './user-profile.controller';
import { AdminUsersController } from './admin-users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    FriendsModule,
    AuthModule,
    NotificationsModule,
    AdminAuditLogModule,
    VerifiedBadgesModule,
  ],
  controllers: [UsersController, UserProfileController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
