import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@ApiTags('packages')
@ApiBearerAuth()
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: 'Create a package.' })
  async create(@Body() dto: CreatePackageDto, @CurrentUser('userId') userId: string) {
    return this.packagesService.create(userId, dto);
  }

  @Get('mine')
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: 'List your agency\'s packages (all statuses).' })
  async listMine(@CurrentUser('userId') userId: string) {
    return this.packagesService.listMine(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a package (public if active, owner sees any status).' })
  async getDetail(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.packagesService.getDetail(id, userId);
  }

  @Patch(':id')
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: 'Update your package.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.packagesService.update(id, userId, dto);
  }

  @Delete(':id')
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: 'Delete your package.' })
  async remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.packagesService.remove(id, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Browse active packages, filter by destination/season/theme.' })
  async listPublic(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('destinationType') destinationType: string | undefined,
    @Query('season') season: string | undefined,
    @Query('theme') theme: string | undefined,
  ) {
    return this.packagesService.listPublic(
      cursor,
      limit ? Number(limit) : undefined,
      destinationType,
      season,
      theme,
    );
  }

  @Post(':packageId/campaigns/:campaignId/link')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'Link an active package to your campaign.' })
  async link(
    @Param('packageId') packageId: string,
    @Param('campaignId') campaignId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.packagesService.linkToCampaign(packageId, campaignId, userId);
  }

  @Delete(':packageId/campaigns/:campaignId/link')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'Unlink a package from your campaign.' })
  async unlink(
    @Param('packageId') packageId: string,
    @Param('campaignId') campaignId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.packagesService.unlinkFromCampaign(packageId, campaignId, userId);
  }
}
