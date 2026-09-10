import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { UsersService } from './users.service';
import { ProfileSetupDto } from './dto/profile-setup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's own profile." })
  async getMe(@CurrentUser('userId') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Post('profile-setup')
  @RequireVerifiedEmail()
  @ApiOperation({
    summary: 'Complete traveler profile setup after email verification.',
  })
  async profileSetup(
    @Body() dto: ProfileSetupDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.setupProfile(userId, dto);
  }

  @Patch('profile')
  @ApiOperation({ summary: "Partially update the current user's own profile." })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: "Get the current user's notification preferences." })
  async getNotificationPreferences(@CurrentUser('userId') userId: string) {
    return this.usersService.getNotificationPreferences(userId);
  }

  @Patch('notification-preferences')
  @ApiOperation({
    summary: "Update the current user's notification preferences.",
  })
  async updateNotificationPreferences(
    @Body() dto: UpdateNotificationPreferencesDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.updateNotificationPreferences(userId, dto);
  }

  @Get('privacy-settings')
  @ApiOperation({ summary: "Get the current user's privacy settings." })
  async getPrivacySettings(@CurrentUser('userId') userId: string) {
    return this.usersService.getPrivacySettings(userId);
  }

  @Patch('privacy-settings')
  @ApiOperation({ summary: "Update the current user's privacy settings." })
  async updatePrivacySettings(
    @Body() dto: UpdatePrivacySettingsDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.updatePrivacySettings(userId, dto);
  }

  @Patch('kyc')
  @ApiOperation({ summary: 'Submit or update your KYC information.' })
  async updateKyc(
    @Body() dto: UpdateKycDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.updateKyc(userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate (soft-delete) the current user account.',
  })
  async deactivateAccount(@CurrentUser('userId') userId: string) {
    await this.usersService.deactivateAccount(userId);
  }
}
