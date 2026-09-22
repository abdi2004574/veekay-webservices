import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { UserRole } from '@prisma/client';
import { AgenciesService } from './agencies.service';
import { AgencyRegistrationDto } from './dto/agency-registration.dto';

@ApiTags('agencies')
@ApiBearerAuth()
@Controller('agency')
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Post('registration')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({
    summary: 'Submit agency business details and verification documents.',
  })
  async register(
    @Body() dto: AgencyRegistrationDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.agenciesService.submitRegistration(userId, dto);
  }

  @Get('status')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: "Get the authenticated agency's own approval status." })
  @ApiResponse({ status: 200, description: "The agency's approval status and rejection reason." })
  async getStatus(@CurrentUser('userId') userId: string) {
    return this.agenciesService.getMyStatus(userId);
  }
}
