import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { NotificationBroadcastService } from './services/notification-broadcast.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { SegmentsPreviewDto } from './dto/segments-preview.dto';

@ApiTags('admin-notifications')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly broadcastService: NotificationBroadcastService,
  ) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Super Admin] Send a broadcast notification.' })
  async broadcast(
    @Body() dto: BroadcastNotificationDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.broadcastService.broadcast(adminUserId, dto);
  }

  @Get('segments/preview')
  @ApiOperation({
    summary: '[Super Admin] Preview estimated reach for a broadcast target.',
  })
  async preview(@Query() dto: SegmentsPreviewDto) {
    return this.broadcastService.previewSegments(dto);
  }
}
