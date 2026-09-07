import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { MediaAssetsService } from './media-assets.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly mediaAssetsService: MediaAssetsService) {}

  @Post('upload-url')
  @ApiOperation({
    summary: 'Request a presigned URL to upload a file directly to storage.',
  })
  async createUploadUrl(
    @Body() dto: CreateUploadUrlDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.mediaAssetsService.createUploadUrl(userId, dto);
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm a file was uploaded to its presigned URL.',
  })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.mediaAssetsService.confirmUpload(userId, dto.mediaId);
  }

  @Get(':mediaId/view-url')
  @ApiOperation({
    summary: 'Get a presigned URL to view/download an uploaded file.',
  })
  async getViewUrl(
    @Param('mediaId') mediaId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!entityType || !entityId) {
      throw AppException.badRequest('entityType and entityId query parameters are required.');
    }
    const url = await this.mediaAssetsService.getViewUrl(userId, mediaId, { entityType, entityId });
    return { url };
  }
}



