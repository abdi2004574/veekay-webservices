import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { UsersService } from './users.service';
import { ProfileSetupDto } from './dto/profile-setup.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
