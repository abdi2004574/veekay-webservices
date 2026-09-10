import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AdminAuditLogService } from './admin-audit-log.service';

@ApiTags('admin-audit-log')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/audit-log')
@UseGuards(PlatformRoleGuard)
export class AdminAuditLogController {
  constructor(private readonly adminAuditLogService: AdminAuditLogService) {}

  @Get()
  @ApiOperation({
    summary: '[Super Admin] List admin audit logs with optional filters and cursor pagination.',
  })
  async findAll(
    @Query() filter: AuditLogFilterDto,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.adminAuditLogService.findAll(
      filter,
      cursor,
      limit ? Number(limit) : 20,
    );
  }
}
