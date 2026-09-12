import { CampaignStatus, PlatformRole, UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { AdminUserStatus } from './dto/admin-user-filter.dto';
import { encodeCursor } from '../../common/utils/cursor-pagination.util';

describe('UsersService admin operations', () => {
  let prisma: any;
  let tokenService: any;
  let adminAuditLogService: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      campaign: { count: jest.fn() },
      donation: { count: jest.fn() },
    };
    tokenService = { revokeAllRefreshTokensForUser: jest.fn() };
    adminAuditLogService = { record: jest.fn() };
    service = new UsersService(
      prisma,
      { getFriendIds: jest.fn() } as any,
      tokenService,
      { create: jest.fn() } as any,
      adminAuditLogService,
      { findActiveBySubject: jest.fn(), revoke: jest.fn() } as any,
    );
  });

  it('filters users and returns the frontend cursor envelope', async () => {
    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    const cursor = encodeCursor({ createdAt, id: 'user-1' });
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-2',
        email: 'alice@example.com',
        username: 'alice',
        displayName: 'Alice',
        role: UserRole.admin,
        platformRole: PlatformRole.super_admin,
        isActive: true,
        createdAt,
      },
    ]);

    const result = await service.listAdminUsers(
      { status: AdminUserStatus.active, search: 'alice' },
      cursor,
      10,
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: expect.arrayContaining([
            expect.objectContaining({
              email: expect.objectContaining({ contains: 'alice' }),
            }),
          ]),
        },
        cursor: { createdAt, id: 'user-1' },
        skip: 1,
        take: 11,
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: 'user-2',
      email: 'alice@example.com',
      role: 'super_admin',
      platformRole: PlatformRole.super_admin,
      isActive: true,
    });
    expect(result.meta).toEqual({
      cursor: expect.any(String),
      hasMore: false,
    });
  });

  it('returns detail statistics for a traveler', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'traveler-1',
      email: 'traveler@example.com',
      username: 'traveler',
      displayName: 'Traveler',
      role: UserRole.traveler,
      platformRole: PlatformRole.user,
      isActive: true,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      travelerProfile: {
        bio: 'Hello',
        location: 'London',
        badge: 'dreamer',
        walletConnected: true,
      },
    });
    prisma.campaign.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    prisma.donation.count.mockResolvedValue(7);

    await expect(service.getAdminUserDetail('traveler-1')).resolves.toEqual(
      expect.objectContaining({
        profile: {
          bio: 'Hello',
          location: 'London',
          badge: 'dreamer',
          walletConnected: true,
        },
        stats: { campaignsCreated: 4, campaignsFunded: 2, donationsMade: 7 },
      }),
    );
  });

  it('deactivates a user, revokes sessions, and records an audit entry', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      displayName: 'User',
      role: UserRole.traveler,
      platformRole: PlatformRole.user,
      isActive: true,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      displayName: 'User',
      role: UserRole.traveler,
      platformRole: PlatformRole.user,
      isActive: false,
      deactivatedAt: new Date('2026-09-10T13:00:00.000Z'),
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });

    const result = await service.updateAdminUserStatus(
      'user-1',
      { isActive: false },
      'admin-1',
    );

    expect(result.isActive).toBe(false);
    expect(tokenService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(
      'user-1',
    );
    expect(adminAuditLogService.record).toHaveBeenCalledWith(
      'admin-1',
      'user.deactivated',
      'user',
      'user-1',
      undefined,
      { previousIsActive: true, newIsActive: false },
    );
  });

  it('returns not found for an unknown user detail', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getAdminUserDetail('missing')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
  });
});
