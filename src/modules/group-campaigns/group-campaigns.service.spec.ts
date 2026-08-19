import { GroupContributionType, GroupExpenseCategory, GroupMemberRole } from '@prisma/client';
import { GroupCampaignsService } from './group-campaigns.service';

describe('GroupCampaignsService', () => {
  let prisma: any;
  let friendsService: any;
  let conversationsService: any;
  let mediaAssetsService: any;
  let service: GroupCampaignsService;

  const groupCampaign = {
    id: 'c-1',
    creatorId: 'admin-1',
    title: 'Bali Bachelor Trip',
    destination: 'Bali, Indonesia',
    goalAmount: { toString: () => '5000' },
    isGroup: true,
    groupConversationId: null as string | null,
  };

  beforeEach(() => {
    prisma = {
      campaign: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      groupMember: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        delete: jest.fn(),
      },
      groupContribution: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      groupExpense: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    };
    friendsService = { areFriends: jest.fn().mockResolvedValue(true) };
    conversationsService = {
      create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      addParticipants: jest.fn().mockResolvedValue(undefined),
      removeParticipant: jest.fn().mockResolvedValue(undefined),
    };
    mediaAssetsService = { resolveViewUrls: jest.fn().mockResolvedValue(new Map()) };
    service = new GroupCampaignsService(
      prisma,
      friendsService,
      conversationsService,
      mediaAssetsService,
    );
  });

  describe('member gating (shared by every method)', () => {
    it('throws not-found for a non-group or missing campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.getOverview('c-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });

      prisma.campaign.findUnique.mockResolvedValue({ ...groupCampaign, isGroup: false });
      await expect(service.getOverview('c-1', 'user-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws forbidden for a non-member', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique.mockResolvedValue(null);

      await expect(service.getOverview('c-1', 'stranger')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('getOverview', () => {
    it('computes total raised, total spent, and each member percentage', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique.mockResolvedValue({ role: GroupMemberRole.member });
      prisma.groupMember.findMany.mockResolvedValue([
        { userId: 'admin-1', role: GroupMemberRole.admin, user: { id: 'admin-1', username: 'a', displayName: 'A' } },
        { userId: 'member-1', role: GroupMemberRole.member, user: { id: 'member-1', username: 'm', displayName: 'M' } },
      ]);
      prisma.groupContribution.groupBy.mockResolvedValue([
        { memberUserId: 'admin-1', _sum: { amount: { toString: () => '750' } } },
        { memberUserId: 'member-1', _sum: { amount: { toString: () => '250' } } },
      ]);
      prisma.groupExpense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '400' } } });

      const overview = await service.getOverview('c-1', 'member-1');

      expect(overview.totalRaised).toBe(1000);
      expect(overview.totalSpent).toBe(400);
      expect(overview.members.find((m) => m.userId === 'admin-1')).toMatchObject({
        contributed: 750,
        percentage: 75,
        isCreator: true,
      });
      expect(overview.members.find((m) => m.userId === 'member-1')).toMatchObject({
        contributed: 250,
        percentage: 25,
        isCreator: false,
      });
    });
  });

  describe('addMember', () => {
    beforeEach(() => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupMemberRole.admin }) // assertAdmin
        .mockResolvedValueOnce(null); // existing-member check
    });

    it('rejects a non-admin caller', async () => {
      prisma.groupMember.findUnique.mockReset();
      prisma.groupMember.findUnique.mockResolvedValue({ role: GroupMemberRole.member });

      await expect(
        service.addMember('c-1', 'member-1', { userId: 'friend-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.groupMember.create).not.toHaveBeenCalled();
    });

    it('rejects adding someone who is not a friend', async () => {
      friendsService.areFriends.mockResolvedValue(false);

      await expect(
        service.addMember('c-1', 'admin-1', { userId: 'stranger-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.groupMember.create).not.toHaveBeenCalled();
    });

    it('rejects adding someone who is already a member', async () => {
      prisma.groupMember.findUnique.mockReset();
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupMemberRole.admin })
        .mockResolvedValueOnce({ role: GroupMemberRole.member }); // already exists

      await expect(
        service.addMember('c-1', 'admin-1', { userId: 'friend-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('lazily creates the group conversation on the first member add', async () => {
      await service.addMember('c-1', 'admin-1', { userId: 'friend-1' });

      expect(prisma.groupMember.create).toHaveBeenCalledWith({
        data: { campaignId: 'c-1', userId: 'friend-1', role: GroupMemberRole.member },
      });
      expect(conversationsService.create).toHaveBeenCalledWith('admin-1', {
        type: 'group',
        title: groupCampaign.title,
        participantIds: ['friend-1'],
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { groupConversationId: 'conv-1' },
      });
      expect(conversationsService.addParticipants).not.toHaveBeenCalled();
    });

    it('appends to an existing group conversation on subsequent adds', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ ...groupCampaign, groupConversationId: 'conv-1' });

      await service.addMember('c-1', 'admin-1', { userId: 'friend-2' });

      expect(conversationsService.addParticipants).toHaveBeenCalledWith('conv-1', 'admin-1', [
        'friend-2',
      ]);
      expect(conversationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('blocks removing the campaign creator', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique.mockResolvedValue({ role: GroupMemberRole.admin });

      await expect(service.removeMember('c-1', 'admin-1', 'admin-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.groupMember.delete).not.toHaveBeenCalled();
    });

    it('removes a member and syncs the conversation', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ ...groupCampaign, groupConversationId: 'conv-1' });
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupMemberRole.admin }) // assertAdmin
        .mockResolvedValueOnce({ id: 'gm-1', role: GroupMemberRole.member }); // target lookup

      await service.removeMember('c-1', 'admin-1', 'member-1');

      expect(prisma.groupMember.delete).toHaveBeenCalledWith({ where: { id: 'gm-1' } });
      expect(conversationsService.removeParticipant).toHaveBeenCalledWith(
        'conv-1',
        'admin-1',
        'member-1',
      );
    });
  });

  describe('addContribution', () => {
    it('always attributes the contribution to the caller, never a selectable member', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique.mockResolvedValue({ role: GroupMemberRole.member });

      await service.addContribution('c-1', 'member-1', { amount: 100, note: 'Hotel' });

      expect(prisma.groupContribution.create).toHaveBeenCalledWith({
        data: {
          campaignId: 'c-1',
          memberUserId: 'member-1',
          amount: 100,
          note: 'Hotel',
          type: GroupContributionType.manual,
        },
      });
    });
  });

  describe('addExpense', () => {
    it('rejects when paidByUserId is not a current group member', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupMemberRole.member }) // caller membership
        .mockResolvedValueOnce(null); // paidBy lookup

      await expect(
        service.addExpense('c-1', 'member-1', {
          name: 'Flights',
          amount: 500,
          category: GroupExpenseCategory.transportation,
          paidByUserId: 'not-a-member',
        }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('creates the expense when paidByUserId is a current member', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: GroupMemberRole.member })
        .mockResolvedValueOnce({ role: GroupMemberRole.admin });

      await service.addExpense('c-1', 'member-1', {
        name: 'Flights',
        amount: 500,
        category: GroupExpenseCategory.transportation,
        paidByUserId: 'admin-1',
      });

      expect(prisma.groupExpense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          campaignId: 'c-1',
          name: 'Flights',
          amount: 500,
          category: GroupExpenseCategory.transportation,
          paidByUserId: 'admin-1',
        }),
      });
    });
  });

  describe('removeExpense', () => {
    it('rejects a non-admin caller', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique.mockResolvedValue({ role: GroupMemberRole.member });

      await expect(service.removeExpense('c-1', 'expense-1', 'member-1')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.groupExpense.delete).not.toHaveBeenCalled();
    });

    it('deletes when the caller is an admin and the expense belongs to the campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(groupCampaign);
      prisma.groupMember.findUnique.mockResolvedValue({ role: GroupMemberRole.admin });
      prisma.groupExpense.findUnique.mockResolvedValue({ id: 'expense-1', campaignId: 'c-1' });

      await service.removeExpense('c-1', 'expense-1', 'admin-1');

      expect(prisma.groupExpense.delete).toHaveBeenCalledWith({ where: { id: 'expense-1' } });
    });
  });

  describe('listMyGroupTrips', () => {
    it('queries campaigns created by or including the user as a group member', async () => {
      prisma.campaign.findMany.mockResolvedValue([]);

      await service.listMyGroupTrips('user-1');

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isGroup: true,
            OR: [{ creatorId: 'user-1' }, { groupMembers: { some: { userId: 'user-1' } } }],
          },
        }),
      );
    });
  });
});
