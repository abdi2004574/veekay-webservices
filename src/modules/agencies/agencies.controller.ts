import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
