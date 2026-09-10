import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preferences.dto';
import { NotificationsService } from './services/notifications.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { PushDeviceService } from './services/push-device.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly pushDeviceService: PushDeviceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsDto,
  ) {
    const limit = query.limit ? Number(query.limit) : 20;
    return this.notificationsService.listForUser(
      user.userId,
      query.type,
      query.cursor,
      limit,
    );
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count for the current user',
  })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read for the current user',
  })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a notification' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notificationsService.delete(id, user.userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'List per-type notification preferences' })
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationPreferenceService.listForUser(user.userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update a single notification-type preference' })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationPreferenceService.set(user.userId, dto);
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register a push device (FCM token)' })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.pushDeviceService.register(
      user.userId,
      dto.fcmToken,
      dto.platform,
    );
  }

  @Get('devices')
  @ApiOperation({ summary: 'List the current user push devices' })
  listDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.pushDeviceService.listForUser(user.userId);
  }

  @Delete('devices/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister a push device by FCM token' })
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<void> {
    await this.pushDeviceService.unregister(user.userId, token);
  }
}
