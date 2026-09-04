import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { GroupCampaignsService } from './group-campaigns.service';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupContributionDto } from './dto/create-group-contribution.dto';
import { CreateGroupExpenseDto } from './dto/create-group-expense.dto';

@ApiTags('group-campaigns')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller('campaigns/:id/group')
export class GroupCampaignsController {
  constructor(private readonly groupCampaignsService: GroupCampaignsService) {}

  @Get('overview')
  @ApiOperation({ summary: "Get a group trip's overview (member-only)." })
  async getOverview(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupCampaignsService.getOverview(id, userId);
  }

  @Get('members')
  @ApiOperation({ summary: 'List group trip members (member-only).' })
  async listMembers(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupCampaignsService.listMembers(id, userId);
  }

  @Post('members')
  @ApiOperation({ summary: 'Add a friend to the group trip (admin-only).' })
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddGroupMemberDto,
    @CurrentUser('userId') userId: string,
  ) {
    await this.groupCampaignsService.addMember(id, userId, dto);
  }

  @Delete('members/:userId')
  @ApiOperation({
    summary: 'Remove a member from the group trip (admin-only).',
  })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.groupCampaignsService.removeMember(id, userId, targetUserId);
  }

  @Get('contributions')
  @ApiOperation({ summary: 'List group trip contributions (member-only).' })
  async listContributions(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupCampaignsService.listContributions(id, userId);
  }

  @Post('contributions')
  @ApiOperation({ summary: 'Record your own contribution to the group trip.' })
  async addContribution(
    @Param('id') id: string,
    @Body() dto: CreateGroupContributionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupCampaignsService.addContribution(id, userId, dto);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'List group trip expenses (member-only).' })
  async listExpenses(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupCampaignsService.listExpenses(id, userId);
  }

  @Post('expenses')
  @ApiOperation({ summary: 'Log a group trip expense.' })
  async addExpense(
    @Param('id') id: string,
    @Body() dto: CreateGroupExpenseDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupCampaignsService.addExpense(id, userId, dto);
  }

  @Delete('expenses/:expenseId')
  @ApiOperation({ summary: 'Delete a group trip expense (admin-only).' })
  async removeExpense(
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.groupCampaignsService.removeExpense(id, expenseId, userId);
  }
}
