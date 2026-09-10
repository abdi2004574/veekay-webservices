import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GroupContributionType,
  GroupMemberRole,
  WithdrawalStatus,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { FriendsService } from '../friends/friends.service';
import { ConversationsService } from '../chat/conversations.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupContributionDto } from './dto/create-group-contribution.dto';
import { CreateGroupExpenseDto } from './dto/create-group-expense.dto';
import { GroupWithdrawDto } from './dto/group-withdraw.dto';
import { UpdateGroupMemberDto } from './dto/update-group-member.dto';

const USER_SELECT = {
  select: { id: true, username: true, displayName: true },
} as const;

const MEMBER_SELECT = {
  id: true,
  userId: true,
  campaignId: true,
  role: true,
  canWithdraw: true,
  joinedAt: true,
} as const;

@Injectable()
export class GroupCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly friendsService: FriendsService,
    private readonly conversationsService: ConversationsService,
    private readonly mediaAssetsService: MediaAssetsService,
  ) {}

  private readonly logger = new Logger(GroupCampaignsService.name);

  private async assertMember(campaignId: string, userId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign || !campaign.isGroup) {
      throw AppException.notFound('Group trip not found.');
    }
    const membership = await this.prisma.groupMember.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      select: MEMBER_SELECT,
    });
    if (!membership) {
      throw AppException.forbidden('You are not a member of this group trip.');
    }
    return { campaign, membership };
  }

  private async assertAdmin(campaignId: string, userId: string) {
    const result = await this.assertMember(campaignId, userId);
    if (result.membership.role !== GroupMemberRole.admin) {
      throw AppException.forbidden('Only a group admin can do this.');
    }
    return result;
  }

  private async assertWithdrawPermission(campaignId: string, userId: string) {
    const result = await this.assertMember(campaignId, userId);
    const canWithdraw =
      result.membership.role === GroupMemberRole.admin ||
      result.membership.canWithdraw;
    if (!canWithdraw) {
      throw AppException.forbidden(
        'Only a group admin or designated member can withdraw funds.',
      );
    }
    return result;
  }

  async getOverview(campaignId: string, userId: string) {
    const { campaign } = await this.assertMember(campaignId, userId);

    const [members, contributionSums, expenseSum] = await Promise.all([
      this.prisma.groupMember.findMany({
        where: { campaignId },
        include: { user: USER_SELECT },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.groupContribution.groupBy({
        by: ['memberUserId'],
        where: { campaignId },
        _sum: { amount: true },
      }),
      this.prisma.groupExpense.aggregate({
        where: { campaignId },
        _sum: { amount: true },
      }),
    ]);

    const contributedByMember = new Map(
      contributionSums.map((c) => [c.memberUserId, Number(c._sum.amount ?? 0)]),
    );
    const totalRaised = [...contributedByMember.values()].reduce(
      (sum, v) => sum + v,
      0,
    );
    const totalSpent = Number(expenseSum._sum.amount ?? 0);

    return {
      id: campaign.id,
      title: campaign.title,
      destination: campaign.destination,
      goalAmount: Number(campaign.goalAmount),
      tripStartDate: campaign.tripStartDate,
      tripEndDate: campaign.tripEndDate,
      groupConversationId: campaign.groupConversationId,
      totalRaised,
      totalSpent,
      members: members.map((m) => {
        const contributed = contributedByMember.get(m.userId) ?? 0;
        return {
          userId: m.userId,
          username: m.user.username,
          displayName: m.user.displayName,
          role: m.role,
          isCreator: m.userId === campaign.creatorId,
          contributed,
          percentage:
            totalRaised > 0 ? Math.round((contributed / totalRaised) * 100) : 0,
        };
      }),
    };
  }

  async listMembers(campaignId: string, userId: string) {
    await this.assertMember(campaignId, userId);
    return this.prisma.groupMember.findMany({
      where: { campaignId },
      include: { user: USER_SELECT },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(campaignId: string, adminId: string, dto: AddGroupMemberDto) {
    const { campaign } = await this.assertAdmin(campaignId, adminId);

    const existing = await this.prisma.groupMember.findUnique({
      where: { campaignId_userId: { campaignId, userId: dto.userId } },
    });
    if (existing) {
      throw AppException.conflict('This user is already a group member.');
    }

    const areFriends = await this.friendsService.areFriends(
      adminId,
      dto.userId,
    );
    if (!areFriends) {
      throw AppException.forbidden('You can only add friends to a group trip.');
    }

    await this.prisma.groupMember.create({
      data: { campaignId, userId: dto.userId, role: GroupMemberRole.member },
    });

    // ConversationsService.create() requires >=1 participant besides the
    // caller, so the group chat can't exist until this first add — create
    // it lazily here, then just append participants from then on.
    if (campaign.groupConversationId) {
      await this.conversationsService.addParticipants(
        campaign.groupConversationId,
        adminId,
        [dto.userId],
      );
    } else {
      const conversation = await this.conversationsService.create(adminId, {
        type: 'group',
        title: campaign.title,
        participantIds: [dto.userId],
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { groupConversationId: conversation.id },
      });
    }
  }

  async removeMember(
    campaignId: string,
    adminId: string,
    targetUserId: string,
  ) {
    const { campaign } = await this.assertAdmin(campaignId, adminId);

    if (targetUserId === campaign.creatorId) {
      throw AppException.businessRule('The group creator cannot be removed.');
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { campaignId_userId: { campaignId, userId: targetUserId } },
    });
    if (!membership) {
      throw AppException.notFound('This user is not a group member.');
    }

    await this.prisma.groupMember.delete({ where: { id: membership.id } });

    if (campaign.groupConversationId) {
      await this.conversationsService.removeParticipant(
        campaign.groupConversationId,
        adminId,
        targetUserId,
      );
    }
  }

  async updateMemberWithdrawPermission(
    campaignId: string,
    adminId: string,
    targetUserId: string,
    canWithdraw: boolean,
  ) {
    await this.assertAdmin(campaignId, adminId);

    const membership = await this.prisma.groupMember.findUnique({
      where: { campaignId_userId: { campaignId, userId: targetUserId } },
    });
    if (!membership) {
      throw AppException.notFound('This user is not a group member.');
    }

    return this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { canWithdraw },
      include: { user: USER_SELECT },
    });
  }

  async listContributions(campaignId: string, userId: string) {
    await this.assertMember(campaignId, userId);
    return this.prisma.groupContribution.findMany({
      where: { campaignId },
      include: { member: USER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addContribution(
    campaignId: string,
    userId: string,
    dto: CreateGroupContributionDto,
  ) {
    await this.assertMember(campaignId, userId);
    return this.prisma.groupContribution.create({
      data: {
        campaignId,
        memberUserId: userId,
        amount: dto.amount,
        note: dto.note,
        type: GroupContributionType.manual,
      },
    });
  }

  async listExpenses(campaignId: string, userId: string) {
    await this.assertMember(campaignId, userId);
    return this.prisma.groupExpense.findMany({
      where: { campaignId },
      include: { paidBy: USER_SELECT },
      orderBy: { spentAt: 'desc' },
    });
  }

  async addExpense(
    campaignId: string,
    userId: string,
    dto: CreateGroupExpenseDto,
  ) {
    await this.assertMember(campaignId, userId);

    const paidByMembership = await this.prisma.groupMember.findUnique({
      where: { campaignId_userId: { campaignId, userId: dto.paidByUserId } },
    });
    if (!paidByMembership) {
      throw AppException.badRequest(
        'paidByUserId must be a current group member.',
      );
    }

    return this.prisma.groupExpense.create({
      data: {
        campaignId,
        name: dto.name,
        amount: dto.amount,
        category: dto.category,
        paidByUserId: dto.paidByUserId,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : new Date(),
      },
    });
  }

  async removeExpense(campaignId: string, expenseId: string, adminId: string) {
    await this.assertAdmin(campaignId, adminId);
    const expense = await this.prisma.groupExpense.findUnique({
      where: { id: expenseId },
    });
    if (!expense || expense.campaignId !== campaignId) {
      throw AppException.notFound('Expense not found.');
    }
    await this.prisma.groupExpense.delete({ where: { id: expenseId } });
  }

  async listMyGroupTrips(userId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        isGroup: true,
        OR: [{ creatorId: userId }, { groupMembers: { some: { userId } } }],
      },
      orderBy: { createdAt: 'desc' },
      include: { photos: { orderBy: { position: 'asc' } }, groupMembers: true },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const [sums, mediaIds] = [
      await this.prisma.groupContribution.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: campaignIds } },
        _sum: { amount: true },
      }),
      campaigns
        .map((c) => c.photos[0]?.mediaId)
        .filter((id): id is string => !!id),
    ];
    const raisedByCampaign = new Map(
      sums.map((s) => [s.campaignId, Number(s._sum.amount ?? 0)]),
    );
    const urlsByMediaId =
      await this.mediaAssetsService.resolveViewUrls(mediaIds);

    return campaigns.map((c) => ({
      id: c.id,
      title: c.title,
      destination: c.destination,
      goalAmount: Number(c.goalAmount),
      memberCount: c.groupMembers.length,
      raised: raisedByCampaign.get(c.id) ?? 0,
      photoUrl: c.photos[0]
        ? (urlsByMediaId.get(c.photos[0].mediaId) ?? null)
        : null,
    }));
  }

  async groupWithdraw(
    campaignId: string,
    userId: string,
    dto: GroupWithdrawDto,
  ) {
    const { membership } = await this.assertWithdrawPermission(
      campaignId,
      userId,
    );

    const [contributionSum, expenseSum] = await Promise.all([
      this.prisma.groupContribution.aggregate({
        where: { campaignId },
        _sum: { amount: true },
      }),
      this.prisma.groupExpense.aggregate({
        where: { campaignId },
        _sum: { amount: true },
      }),
    ]);

    const totalRaised = new Decimal(contributionSum._sum.amount ?? 0);
    const totalSpent = new Decimal(expenseSum._sum.amount ?? 0);
    const available = totalRaised.minus(totalSpent);

    if (dto.currency !== 'USD') {
      throw AppException.businessRule('Only USD withdrawals are supported.');
    }

    const amount = new Decimal(dto.amount);
    if (amount.greaterThan(available)) {
      throw AppException.businessRule('Insufficient group funds.');
    }

    const threshold = this.configService.get(
      'wallet.highValueWithdrawalThreshold',
      { infer: true },
    );
    if (dto.amount >= threshold) {
      const profile = await this.prisma.travelerProfile.findUnique({
        where: { userId },
      });
      if (!profile || !profile.identityVerified) {
        throw AppException.businessRule(
          'Identity verification is required for withdrawals of $1,000 or more. Please complete identity verification in your profile.',
        );
      }
    }

    return this.prisma.withdrawalRequest.create({
      data: {
        userId,
        campaignId,
        amount,
        currency: dto.currency,
        status: WithdrawalStatus.requested,
      },
    });
  }
}
