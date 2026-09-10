import { AdminInvite, AdminInviteStatus, PlatformRole } from '@prisma/client';
import { AdminInvitesService } from './admin-invites.service';

describe('AdminInvitesService', () => {
  let prisma: any;
  let mailService: any;
  let service: AdminInvitesService;

  beforeEach(() => {
    prisma = {
      adminInvite: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
    };
    mailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    service = new AdminInvitesService(prisma, mailService);
  });

  describe('create', () => {
    it('generates token, hashes it, stores invite, and sends email', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const storedInvite = {
        id: 'invite-1',
        email: 'new.admin@example.com',
        token: 'hashed-token-here',
        invitedById: 'actor-1',
        status: AdminInviteStatus.pending,
        expiresAt,
        acceptedAt: null,
        createdAt: new Date(),
      };

      prisma.adminInvite.create.mockResolvedValue(storedInvite);

      const dto = {
        email: 'new.admin@example.com',
        platformRole: 'super_admin' as const,
        acceptUrl:
          'http://localhost:57800/admin/invites/accept?token=RAW_TOKEN',
      };

      const result = await service.create('actor-1', dto);

      expect(prisma.adminInvite.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          token: expect.any(String),
          invitedById: 'actor-1',
          expiresAt: expect.any(Date),
        },
      });
      expect(mailService.send).toHaveBeenCalledWith({
        to: dto.email,
        subject: "You'\''ve been invited to Veakay Admin",
        html: expect.stringContaining(dto.acceptUrl),
      });
      expect(result.id).toBe('invite-1');
    });
  });

  describe('findAll', () => {
    it('returns invites ordered by createdAt desc', async () => {
      const invites = [
        {
          id: 'invite-2',
          email: 'a@example.com',
          token: 'hash2',
          invitedById: 'actor-1',
          status: AdminInviteStatus.pending,
          expiresAt: new Date(),
          acceptedAt: null,
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'invite-1',
          email: 'b@example.com',
          token: 'hash1',
          invitedById: 'actor-1',
          status: AdminInviteStatus.pending,
          expiresAt: new Date(),
          acceptedAt: null,
          createdAt: new Date('2024-01-01'),
        },
      ];
      prisma.adminInvite.findMany.mockResolvedValue(invites);

      const result = await service.findAll();

      expect(result).toEqual(invites);
      expect(prisma.adminInvite.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns a single invite by id', async () => {
      const invite = {
        id: 'invite-1',
        email: 'a@example.com',
        token: 'hash',
        invitedById: 'actor-1',
        status: AdminInviteStatus.pending,
        expiresAt: new Date(),
        acceptedAt: null,
        createdAt: new Date(),
      };
      prisma.adminInvite.findUnique.mockResolvedValue(invite);

      const result = await service.findOne('invite-1');

      expect(result).toEqual(invite);
      expect(prisma.adminInvite.findUnique).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
      });
    });

    it('throws notFound when invite does not exist', async () => {
      prisma.adminInvite.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('revoke', () => {
    it('changes status to revoked for pending invite', async () => {
      const existingInvite = {
        id: 'invite-1',
        email: 'a@example.com',
        token: 'hash',
        invitedById: 'actor-1',
        status: AdminInviteStatus.pending,
        expiresAt: new Date(),
        acceptedAt: null,
        createdAt: new Date(),
      };
      prisma.adminInvite.findUnique.mockResolvedValue(existingInvite);

      const revokedInvite = {
        ...existingInvite,
        status: AdminInviteStatus.revoked,
      };
      prisma.adminInvite.update.mockResolvedValue(revokedInvite);

      const result = await service.revoke('actor-1', 'invite-1');

      expect(result.status).toBe(AdminInviteStatus.revoked);
      expect(prisma.adminInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        data: { status: AdminInviteStatus.revoked },
      });
    });

    it('throws badRequest for non-pending invite', async () => {
      const existingInvite = {
        id: 'invite-1',
        email: 'a@example.com',
        token: 'hash',
        invitedById: 'actor-1',
        status: AdminInviteStatus.accepted,
        expiresAt: new Date(),
        acceptedAt: new Date(),
        createdAt: new Date(),
      };
      prisma.adminInvite.findUnique.mockResolvedValue(existingInvite);

      await expect(service.revoke('actor-1', 'invite-1')).rejects.toMatchObject(
        {
          getStatus: expect.any(Function),
        },
      );
      expect(prisma.adminInvite.update).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('updates user platformRole and invite acceptedAt', async () => {
      const now = new Date();
      const pendingInvite = {
        id: 'invite-1',
        email: 'a@example.com',
        token: await (service as any).hashToken('correct-token'),
        invitedById: 'actor-1',
        status: AdminInviteStatus.pending,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
      };

      prisma.adminInvite.findMany.mockResolvedValue([pendingInvite]);
      prisma.adminInvite.update.mockResolvedValue({
        ...pendingInvite,
        status: AdminInviteStatus.accepted,
        acceptedAt: now,
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        platformRole: PlatformRole.super_admin,
      });

      const result = await service.accept('user-1', { token: 'correct-token' });

      expect(result.message).toBe('Admin invite accepted successfully.');
      expect(prisma.adminInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        data: {
          status: AdminInviteStatus.accepted,
          acceptedAt: expect.any(Date),
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { platformRole: PlatformRole.super_admin },
      });
    });

    it('rejects expired invite by returning empty findMany result', async () => {
      prisma.adminInvite.findMany.mockResolvedValue([]);

      await expect(
        service.accept('user-1', { token: 'any-token' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('rejects non-pending invite by returning empty findMany result', async () => {
      prisma.adminInvite.findMany.mockResolvedValue([]);

      await expect(
        service.accept('user-1', { token: 'any-token' }),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });
});
