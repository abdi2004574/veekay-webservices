import { AgencyStaffPermission, UserRole } from '@prisma/client';
import { AgenciesStaffService } from './agencies-staff.service';

describe('AgenciesStaffService', () => {
  let prisma: any;
  let service: AgenciesStaffService;
  let mockMailService: any;
  let mockNotificationsService: any;
  let mockAdminAuditLogService: any;

  beforeEach(() => {
    prisma = {
      agencyStaff: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      agency: {
        findUnique: jest.fn(),
      },
    };
    mockMailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };
    mockAdminAuditLogService = {
      record: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    service = new AgenciesStaffService(
      prisma,
      mockMailService as any,
      mockNotificationsService as any,
      mockAdminAuditLogService as any,
    );
  });

  const ownerStaff = {
    id: 'owner-staff',
    agencyId: 'agency-1',
    userId: 'owner-1',
    permission: AgencyStaffPermission.owner,
  };

  const createStaffWithUser = (overrides: Record<string, any> = {}) => ({
    id: 'staff-1',
    agencyId: 'agency-1',
    userId: 'user-1',
    permission: AgencyStaffPermission.support,
    createdAt: new Date('2024-01-01'),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      displayName: null,
      username: 'user1',
    },
    ...overrides,
  });

  describe('listStaff', () => {
    it('returns all staff for owner', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValue(ownerStaff);
      const allStaff = [
        createStaffWithUser({ id: 's1', userId: 'owner-1', permission: AgencyStaffPermission.owner }),
        createStaffWithUser({ id: 's2', userId: 'member-1', permission: AgencyStaffPermission.admin }),
        createStaffWithUser({ id: 's3', userId: 'member-2', permission: AgencyStaffPermission.support }),
      ];
      prisma.agencyStaff.findMany.mockResolvedValue(allStaff);

      const result = await service.listStaff('agency-1', 'owner-1');

      expect(result).toEqual(allStaff);
    });

    it('returns only self for non-owner staff', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValue({
        id: 'self-staff',
        agencyId: 'agency-1',
        userId: 'requester-1',
        permission: AgencyStaffPermission.support,
      });
      prisma.agencyStaff.findMany.mockResolvedValue([
        createStaffWithUser({ id: 's1', userId: 'requester-1', permission: AgencyStaffPermission.support }),
        createStaffWithUser({ id: 's2', userId: 'other-1', permission: AgencyStaffPermission.admin }),
        createStaffWithUser({ id: 's3', userId: 'other-2', permission: AgencyStaffPermission.support }),
      ]);

      const result = await service.listStaff('agency-1', 'requester-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('requester-1');
    });

    it('throws forbidden when requester is not a member', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValue(null);

      await expect(service.listStaff('agency-1', 'non-member')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('orders by createdAt ascending', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValue(ownerStaff);
      prisma.agencyStaff.findMany.mockResolvedValue([]);

      await service.listStaff('agency-1', 'owner-1');

      expect(prisma.agencyStaff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
      );
    });
  });

  describe('inviteStaff', () => {
    it('creates staff member for owner only', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);
      prisma.agencyStaff.create.mockResolvedValue(
        createStaffWithUser({
          id: 'new-staff',
          agencyId: 'agency-1',
          userId: 'invited-1',
          permission: AgencyStaffPermission.support,
          createdAt: new Date(),
        }),
      );

      const result = await service.inviteStaff('agency-1', 'owner-1', {
        email: 'invited@example.com',
      });

      expect(result).toBeDefined();
      expect(prisma.agencyStaff.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agencyId: 'agency-1',
            userId: 'invited-1',
            permission: AgencyStaffPermission.support,
          }),
          include: expect.objectContaining({ user: { select: expect.objectContaining({ id: true }) } }),
        }),
      );
    });

    it('throws forbidden for non-owner', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValue({
        id: 'admin-staff',
        agencyId: 'agency-1',
        userId: 'non-owner',
        permission: AgencyStaffPermission.admin,
      });

      await expect(
        service.inviteStaff('agency-1', 'non-owner', { email: 'test@example.com' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws notFound if invited user does not exist', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteStaff('agency-1', 'owner-1', { email: 'missing@example.com' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws businessRule if invited user is not agency role', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'traveler-1',
        email: 'traveler@example.com',
        role: UserRole.traveler,
      });

      await expect(
        service.inviteStaff('agency-1', 'owner-1', { email: 'traveler@example.com' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws conflict if user already staff', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce({
        id: 'existing-staff',
        agencyId: 'agency-1',
        userId: 'invited-1',
        permission: AgencyStaffPermission.support,
      });

      await expect(
        service.inviteStaff('agency-1', 'owner-1', { email: 'invited@example.com' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('defaults permission to support when not specified', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);
      prisma.agencyStaff.create.mockResolvedValue(
        createStaffWithUser({
          id: 'new-staff',
          permission: AgencyStaffPermission.support,
        }),
      );

      await service.inviteStaff('agency-1', 'owner-1', { email: 'invited@example.com' });

      expect(prisma.agencyStaff.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ permission: AgencyStaffPermission.support }),
        }),
      );
    });

    it('uses admin when dto.permission is admin', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);
      prisma.agencyStaff.create.mockResolvedValue(
        createStaffWithUser({
          id: 'new-staff',
          permission: AgencyStaffPermission.admin,
        }),
      );

      await service.inviteStaff('agency-1', 'owner-1', {
        email: 'invited@example.com',
        permission: 'admin',
      });

      expect(prisma.agencyStaff.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ permission: AgencyStaffPermission.admin }),
        }),
      );
    });

    it('records admin audit log', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);
      prisma.agencyStaff.create.mockResolvedValue(
        createStaffWithUser({ id: 'new-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.inviteStaff('agency-1', 'owner-1', { email: 'invited@example.com' });

      expect(mockAdminAuditLogService.record).toHaveBeenCalledWith(
        'owner-1',
        'agency.staff.invited',
        'AgencyStaff',
        expect.any(String),
        expect.stringContaining('invited@example.com'),
        expect.objectContaining({ email: 'invited@example.com', permission: AgencyStaffPermission.support }),
      );
    });

    it('sends notification to invited user', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);
      prisma.agencyStaff.create.mockResolvedValue(
        createStaffWithUser({ id: 'new-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.inviteStaff('agency-1', 'owner-1', { email: 'invited@example.com' });

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'invited-1',
        expect.objectContaining({
          type: 'account_status',
          title: 'Agency Staff Invitation',
          deepLinkTarget: 'agency',
          deepLinkEntityId: 'agency-1',
        }),
      );
    });

    it('sends invite email', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.user.findUnique.mockResolvedValue({
        id: 'invited-1',
        email: 'invited@example.com',
        role: UserRole.agency,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);
      prisma.agencyStaff.create.mockResolvedValue(
        createStaffWithUser({ id: 'new-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.inviteStaff('agency-1', 'owner-1', { email: 'invited@example.com' });

      expect(mockMailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'invited@example.com' }),
      );
    });
  });

  describe('updateStaffPermission', () => {
    it('owner can update permission', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agencyStaff.update.mockResolvedValue(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.admin }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      const result = await service.updateStaffPermission(
        'agency-1',
        'owner-1',
        'target-staff',
        { permission: 'admin' as const },
      );

      expect(result).toBeDefined();
      expect(result.permission).toBe(AgencyStaffPermission.admin);
    });

    it('throws forbidden for non-owner', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce({
        id: 'admin-staff',
        agencyId: 'agency-1',
        userId: 'non-owner',
        permission: AgencyStaffPermission.admin,
      });

      await expect(
        service.updateStaffPermission('agency-1', 'non-owner', 'target-staff', {
          permission: 'admin' as const,
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws notFound if staff not found or wrong agency', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateStaffPermission('agency-1', 'owner-1', 'missing-staff', {
          permission: 'admin' as const,
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws businessRule if trying to change own permission', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'owner-staff', userId: 'owner-1', permission: AgencyStaffPermission.owner }),
      );

      await expect(
        service.updateStaffPermission('agency-1', 'owner-1', 'owner-staff', {
          permission: 'admin' as const,
        }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns updated staff with user info', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      const updatedStaff = createStaffWithUser({
        id: 'target-staff',
        permission: AgencyStaffPermission.admin,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          username: 'testuser',
        },
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agencyStaff.update.mockResolvedValue(updatedStaff);
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      const result = await service.updateStaffPermission(
        'agency-1',
        'owner-1',
        'target-staff',
        { permission: 'admin' as const },
      );

      expect(result).toEqual(updatedStaff);
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('user@example.com');
    });

    it('records audit log on change', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agencyStaff.update.mockResolvedValue(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.admin }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.updateStaffPermission('agency-1', 'owner-1', 'target-staff', {
        permission: 'admin' as const,
      });

      expect(mockAdminAuditLogService.record).toHaveBeenCalledWith(
        'owner-1',
        'agency.staff.permission_changed',
        'AgencyStaff',
        'target-staff',
        expect.stringContaining('support'),
        expect.objectContaining({
          oldPermission: AgencyStaffPermission.support,
          newPermission: AgencyStaffPermission.admin,
          targetUserId: 'user-1',
        }),
      );
    });

    it('sends notification on change', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agencyStaff.update.mockResolvedValue(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.admin }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.updateStaffPermission('agency-1', 'owner-1', 'target-staff', {
        permission: 'admin' as const },
      );

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          type: 'account_status',
          title: 'Permission Updated',
          deepLinkTarget: 'agency',
          deepLinkEntityId: 'agency-1',
        }),
      );
    });

    it('returns unchanged if same permission', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      const targetStaff = createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.admin });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(targetStaff);

      const result = await service.updateStaffPermission('agency-1', 'owner-1', 'target-staff', {
        permission: 'admin' as const,
      });

      expect(result).toEqual(targetStaff);
      expect(prisma.agencyStaff.update).not.toHaveBeenCalled();
      expect(mockAdminAuditLogService.record).not.toHaveBeenCalled();
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('removeStaff', () => {
    it('owner can remove staff', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', permission: AgencyStaffPermission.support }),
      );
      prisma.agencyStaff.delete.mockResolvedValue(undefined);
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.removeStaff('agency-1', 'owner-1', 'target-staff');

      expect(prisma.agencyStaff.delete).toHaveBeenCalledWith({ where: { id: 'target-staff' } });
    });

    it('throws forbidden for non-owner', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce({
        id: 'admin-staff',
        agencyId: 'agency-1',
        userId: 'non-owner',
        permission: AgencyStaffPermission.admin,
      });

      await expect(service.removeStaff('agency-1', 'non-owner', 'target-staff')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws notFound if staff not found', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);

      await expect(service.removeStaff('agency-1', 'owner-1', 'missing-staff')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws businessRule if removing self', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'owner-staff', userId: 'owner-1', permission: AgencyStaffPermission.owner }),
      );

      await expect(service.removeStaff('agency-1', 'owner-1', 'owner-staff')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('records audit log', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({
          id: 'target-staff',
          userId: 'target-user',
          permission: AgencyStaffPermission.support,
          user: {
            id: 'target-user',
            email: 'target@example.com',
            displayName: null,
            username: 'target',
          },
        }),
      );
      prisma.agencyStaff.delete.mockResolvedValue(undefined);
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.removeStaff('agency-1', 'owner-1', 'target-staff');

      expect(mockAdminAuditLogService.record).toHaveBeenCalledWith(
        'owner-1',
        'agency.staff.removed',
        'AgencyStaff',
        'target-staff',
        expect.stringContaining('target@example.com'),
        expect.objectContaining({
          removedUserId: 'target-user',
          removedPermission: AgencyStaffPermission.support,
        }),
      );
    });

    it('sends removal notification', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({
          id: 'target-staff',
          userId: 'target-user',
          permission: AgencyStaffPermission.support,
          user: {
            id: 'target-user',
            email: 'target@example.com',
            displayName: null,
            username: 'target',
          },
        }),
      );
      prisma.agencyStaff.delete.mockResolvedValue(undefined);
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.removeStaff('agency-1', 'owner-1', 'target-staff');

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'target-user',
        expect.objectContaining({
          type: 'account_status',
          title: 'Removed from Agency',
          deepLinkTarget: 'agency',
          deepLinkEntityId: 'agency-1',
        }),
      );
    });
  });

  describe('resendInvite', () => {
    it('owner can resend', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({
          id: 'target-staff',
          userId: 'target-user',
          permission: AgencyStaffPermission.support,
          user: {
            id: 'target-user',
            email: 'target@example.com',
            displayName: null,
            username: 'target',
          },
        }),
      );

      await service.resendInvite('agency-1', 'owner-1', 'target-staff');

      expect(mockMailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'target@example.com' }),
      );
    });

    it('throws forbidden for non-owner', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce({
        id: 'admin-staff',
        agencyId: 'agency-1',
        userId: 'non-owner',
        permission: AgencyStaffPermission.admin,
      });

      await expect(service.resendInvite('agency-1', 'non-owner', 'target-staff')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws notFound if staff not found', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);

      await expect(service.resendInvite('agency-1', 'owner-1', 'missing-staff')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('records audit log', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({
          id: 'target-staff',
          userId: 'target-user',
          permission: AgencyStaffPermission.support,
          user: {
            id: 'target-user',
            email: 'target@example.com',
            displayName: null,
            username: 'target',
          },
        }),
      );

      await service.resendInvite('agency-1', 'owner-1', 'target-staff');

      expect(mockAdminAuditLogService.record).toHaveBeenCalledWith(
        'owner-1',
        'agency.staff.invite_resent',
        'AgencyStaff',
        'target-staff',
        expect.stringContaining('target@example.com'),
        expect.objectContaining({ email: 'target@example.com' }),
      );
    });

    it('sends invite email', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({
          id: 'target-staff',
          userId: 'target-user',
          permission: AgencyStaffPermission.support,
          user: {
            id: 'target-user',
            email: 'target@example.com',
            displayName: null,
            username: 'target',
          },
        }),
      );
      prisma.agency.findUnique.mockResolvedValue({ agencyName: 'Test Agency' });

      await service.resendInvite('agency-1', 'owner-1', 'target-staff');

      expect(mockMailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'target@example.com' }),
      );
    });
  });

  describe('getStaffAuditLog', () => {
    it('owner can view any staff audit log', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', userId: 'other-user' }),
      );

      await service.getStaffAuditLog('agency-1', 'owner-1', 'target-staff');

      expect(mockAdminAuditLogService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'AgencyStaff', targetId: 'target-staff' }),
        undefined,
        20,
      );
    });

    it('non-owner can view own audit log only', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce({
        id: 'requester-staff',
        agencyId: 'agency-1',
        userId: 'requester-1',
        permission: AgencyStaffPermission.support,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', userId: 'requester-1' }),
      );

      await service.getStaffAuditLog('agency-1', 'requester-1', 'target-staff');

      expect(mockAdminAuditLogService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'AgencyStaff', targetId: 'target-staff' }),
        undefined,
        20,
      );
    });

    it('throws forbidden for other staff', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce({
        id: 'requester-staff',
        agencyId: 'agency-1',
        userId: 'requester-1',
        permission: AgencyStaffPermission.support,
      });
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', userId: 'other-user' }),
      );

      await expect(
        service.getStaffAuditLog('agency-1', 'requester-1', 'target-staff'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('throws notFound if target staff not found', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getStaffAuditLog('agency-1', 'owner-1', 'missing-staff'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('delegates to adminAuditLogService.findAll', async () => {
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(ownerStaff);
      prisma.agencyStaff.findUnique.mockResolvedValueOnce(
        createStaffWithUser({ id: 'target-staff', userId: 'user-1' }),
      );
      mockAdminAuditLogService.findAll.mockResolvedValue({
        items: [{ action: 'agency.staff.invited', actorId: 'owner-1' }],
        nextCursor: null,
      });

      const result = await service.getStaffAuditLog('agency-1', 'owner-1', 'target-staff', 'cursor-1', 10);

      expect(mockAdminAuditLogService.findAll).toHaveBeenCalledWith(
        { targetType: 'AgencyStaff', targetId: 'target-staff' },
        'cursor-1',
        10,
      );
      expect(result).toEqual({
        items: [{ action: 'agency.staff.invited', actorId: 'owner-1' }],
        nextCursor: null,
      });
    });
  });
});
