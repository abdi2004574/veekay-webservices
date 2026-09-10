import {
  UserRole,
  WalletTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletService } from './wallet.service';
describe('WalletService', () => {
  let prisma: any;
  let fundingProvider: any;
  let notificationsService: any;
  let service: WalletService;
  let configService: any;
  let adminAuditLogService: any;
  beforeEach(() => {
    prisma = {
      walletAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      withdrawalRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      donation: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      campaign: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
    fundingProvider = { name: 'manual', deposit: jest.fn() };
    notificationsService = { create: jest.fn() };
    configService = {
      get: jest.fn((key) => {
        if (key === 'wallet.donationFeePercentage') return 0;
        if (key === 'wallet.highValueWithdrawalThreshold') return 1000;
        return undefined;
      }),
    };
    adminAuditLogService = { record: jest.fn() };
    service = new WalletService(
      prisma,
      fundingProvider,
      notificationsService,
      configService,
      adminAuditLogService,
    );
  });
  const wallet = (overrides: Record<string, unknown> = {}) => ({
    id: 'wallet-1',
    userId: 'user-1',
    currency: 'USD',
    cachedBalance: new Decimal(100),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  const creditParams = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user-1',
    amount: 50,
    currency: 'USD',
    type: WalletTransactionType.donation_received,
    referenceType: 'manual',
    referenceId: 'ref-1',
    idempotencyKey: 'idem-credit-1',
    description: 'test',
    ...overrides,
  });
  describe('getOrCreateWalletAccount', () => {
    it('returns the existing wallet when found', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      const result = await service.getOrCreateWalletAccount('user-1');
      expect(result.id).toBe('wallet-1');
      expect(prisma.walletAccount.create).not.toHaveBeenCalled();
    });
    it('creates a new wallet with USD currency and balance 0 when not found', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(null);
      prisma.walletAccount.create.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(0) }),
      );
      await service.getOrCreateWalletAccount('user-1');
      expect(prisma.walletAccount.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          currency: 'USD',
          cachedBalance: new Decimal(0),
        },
      });
    });
  });
  describe('getMyWallet', () => {
    it('returns balance as a number', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(123.45) }),
      );
      const result = await service.getMyWallet('user-1');
      expect(result.balance).toBe(123.45);
      expect(typeof result.balance).toBe('number');
    });
  });
  describe('credit', () => {
    it('increments balance and creates a credit transaction', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });
      await service.credit(creditParams());
      expect(prisma.walletAccount.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { cachedBalance: { increment: new Decimal(50) } },
      });
    });
    it('emits wallet.transaction audit log', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.credit(creditParams());
      const logged = JSON.parse(logSpy.mock.calls[0][0]);
      expect(logged.audit).toBe('wallet.transaction');
      expect(logged.amount).toBe(50);
      expect(logged.direction).toBe('credit');
    });
    it('throws businessRule on currency mismatch', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ currency: 'USD' }),
      );
      await expect(
        service.credit(creditParams({ currency: 'EUR' })),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
    it('replays an existing transaction when idempotencyKey matches', async () => {
      const existing = { id: 'tx-existing' };
      prisma.walletTransaction.findUnique.mockResolvedValue(existing);
      const result = await service.credit(creditParams());
      expect(result).toBe(existing);
      expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    });
  });
  describe('debit', () => {
    it('decrements balance and creates a debit transaction', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(200) }),
      );
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });
      await service.debit(
        creditParams({ amount: 75, idempotencyKey: 'idem-d-1' }),
      );
      expect(prisma.walletAccount.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { cachedBalance: { decrement: new Decimal(75) } },
      });
    });
    it('throws businessRule on insufficient balance', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(10) }),
      );
      await expect(
        service.debit(creditParams({ amount: 100 })),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
    it('emits wallet.transaction audit log on debit', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(200) }),
      );
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.debit(creditParams({ amount: 25 }));
      const logged = JSON.parse(logSpy.mock.calls[0][0]);
      expect(logged.audit).toBe('wallet.transaction');
      expect(logged.direction).toBe('debit');
      expect(logged.amount).toBe(25);
    });
  });
  describe('adminCredit', () => {
    const dto = { amount: 100, currency: 'USD', description: 'ops seed' };
    it('calls fundingProvider.deposit then credits on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
      });
      fundingProvider.deposit.mockResolvedValue({
        ok: true,
        externalId: 'm-1',
      });
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });
      await service.adminCredit('admin-1', 'user-1', dto, 'idem-admin-1');
      expect(fundingProvider.deposit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100 }),
      );
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Admin credit by admin-1: ops seed',
          }),
        }),
      );
    });
    it('throws businessRule and does not credit when provider declines', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
      });
      fundingProvider.deposit.mockResolvedValue({
        ok: false,
        message: 'declined',
      });
      await expect(
        service.adminCredit('admin-1', 'user-1', dto, 'idem-admin-2'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('throws notFound when target user is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.adminCredit('admin-1', 'user-1', dto, 'idem-admin-3'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('recordDonation', () => {
    const dp = (o = {}) => ({
      campaignId: 'camp-1',
      donorUserId: 'donor-1',
      donorDisplayName: 'Donor One',
      amount: 25,
      currency: 'USD',
      isAnonymous: false,
      isGift: false,
      idempotencyKey: 'idem-don-1',
      ...o,
    });
    it('creates donation, credits creator, updates campaign and links walletTransactionId', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        creatorId: 'user-1',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        role: UserRole.traveler,
      });
      prisma.donation.create.mockResolvedValue({ id: 'don-1' });
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });
      prisma.campaign.update.mockResolvedValue({});
      prisma.donation.update.mockResolvedValue({});
      await service.recordDonation(dp());
      expect(prisma.donation.create).toHaveBeenCalled();
      expect(prisma.walletAccount.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { cachedBalance: { increment: new Decimal(25) } },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { raisedAmount: { increment: new Decimal(25) } },
      });
      expect(prisma.donation.update).toHaveBeenCalledWith({
        where: { id: 'don-1' },
        data: { walletTransactionId: 'tx-1' },
      });
    });
    it('throws notFound when campaign does not exist', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.recordDonation(dp())).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
    it('throws businessRule on currency mismatch', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        creatorId: 'user-1',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        role: UserRole.traveler,
      });
      prisma.donation.create.mockResolvedValue({ id: 'don-1' });
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ currency: 'USD' }),
      );
      await expect(
        service.recordDonation(dp({ currency: 'EUR' })),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('listTransactions', () => {
    it('filters by wallet account and returns items', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletTransaction.findMany.mockResolvedValue([]);
      const result = await service.listTransactions('user-1', {});
      expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { walletAccountId: 'wallet-1' } }),
      );
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });
    it('applies type filter when present', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletTransaction.findMany.mockResolvedValue([]);
      await service.listTransactions('user-1', {
        type: WalletTransactionType.withdrawal,
      } as any);
      expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            walletAccountId: 'wallet-1',
            type: WalletTransactionType.withdrawal,
          },
        }),
      );
    });
    it('returns nextCursor and slices when hasMore', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(wallet());
      prisma.walletTransaction.findMany.mockResolvedValue([
        { id: 'tx-1' },
        { id: 'tx-2' },
        { id: 'tx-3' },
      ]);
      const result = await service.listTransactions('user-1', {
        limit: 2,
      } as any);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('tx-2');
    });
  });
  describe('requestWithdrawal', () => {
    const dto = (o = {}) =>
      ({ amount: 30, currency: 'USD', campaignId: undefined, ...o }) as any;
    it('creates request in requested status with highValueThreshold: null', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(100) }),
      );
      prisma.withdrawalRequest.create.mockResolvedValue({
        id: 'wr-1',
        amount: new Decimal(30),
        currency: 'USD',
      });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.requestWithdrawal('user-1', dto(), 'idem-w-1');
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          campaignId: undefined,
          amount: new Decimal(30),
          currency: 'USD',
          status: WithdrawalStatus.requested,
          highValueThreshold: null,
        },
      });
      const logged = JSON.parse(logSpy.mock.calls[0][0]);
      expect(logged.audit).toBe('wallet.withdrawal.requested');
    });
    it('throws businessRule on insufficient balance', async () => {
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(10) }),
      );
      await expect(
        service.requestWithdrawal('user-1', dto({ amount: 50 }), 'idem-w-2'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('listMyWithdrawals', () => {
    it('filters by userId', async () => {
      prisma.withdrawalRequest.findMany.mockResolvedValue([]);
      await service.listMyWithdrawals('user-1', undefined, 20);
      expect(prisma.withdrawalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
    it('returns nextCursor when hasMore', async () => {
      prisma.withdrawalRequest.findMany.mockResolvedValue([
        { id: 'wr-1' },
        { id: 'wr-2' },
        { id: 'wr-3' },
      ]);
      const result = await service.listMyWithdrawals('user-1', undefined, 2);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('wr-2');
    });
  });
  describe('getWithdrawalDetail', () => {
    it('returns request when caller owns it', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        userId: 'user-1',
      });
      const result = await service.getWithdrawalDetail(
        'wr-1',
        'user-1',
        UserRole.traveler,
      );
      expect(result.id).toBe('wr-1');
    });
    it('throws notFound for cross-user reads', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        userId: 'user-2',
      });
      await expect(
        service.getWithdrawalDetail('wr-1', 'user-1', UserRole.traveler),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
    it('throws forbidden for admin role', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        userId: 'user-1',
      });
      await expect(
        service.getWithdrawalDetail('wr-1', 'admin-1', UserRole.admin),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('getWithdrawalDetailForAdmin', () => {
    it('returns request with included user', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        user: { id: 'user-1', username: 'u1', email: 'u1@x' },
      });
      const result = await service.getWithdrawalDetailForAdmin('wr-1');
      expect(result.user.username).toBe('u1');
    });
    it('throws notFound when missing', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.getWithdrawalDetailForAdmin('wr-missing'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('reviewWithdrawal', () => {
    it('approves a requested withdrawal and emits audit log', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.requested,
      });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.approved,
      });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.reviewWithdrawal('admin-1', 'wr-1', {
        decision: 'approved',
      } as any);
      expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith({
        where: { id: 'wr-1' },
        data: { status: WithdrawalStatus.approved },
      });
      const logged = JSON.parse(logSpy.mock.calls[0][0]);
      expect(logged.audit).toBe('wallet.withdrawal.reviewed');
      expect(logged.decision).toBe('approved');
    });
    it('rejects a requested withdrawal with reason', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.requested,
      });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.rejected,
      });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.reviewWithdrawal('admin-1', 'wr-1', {
        decision: 'rejected',
        reason: 'insufficient docs',
      } as any);
      expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith({
        where: { id: 'wr-1' },
        data: {
          status: WithdrawalStatus.rejected,
          rejectionReason: 'insufficient docs',
        },
      });
      const logged = JSON.parse(logSpy.mock.calls[0][0]);
      expect(logged.decision).toBe('rejected');
    });
    it('throws businessRule if status is not requested', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.approved,
      });
      await expect(
        service.reviewWithdrawal('admin-1', 'wr-1', {
          decision: 'approved',
        } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
    it('throws notFound when missing', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.reviewWithdrawal('admin-1', 'wr-1', {
          decision: 'approved',
        } as any),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('markWithdrawalPaid', () => {
    it('debits wallet and transitions approved to paid', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        userId: 'user-1',
        amount: new Decimal(40),
        currency: 'USD',
        status: WithdrawalStatus.approved,
      });
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.walletAccount.findUnique.mockResolvedValue(
        wallet({ cachedBalance: new Decimal(100) }),
      );
      prisma.walletAccount.update.mockResolvedValue(wallet());
      prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-debit-1' });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.paid,
      });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.markWithdrawalPaid('system', 'wr-1', 'idem-paid-1');
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: 'debit',
            type: WalletTransactionType.withdrawal,
            amount: new Decimal(40),
          }),
        }),
      );
      expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith({
        where: { id: 'wr-1' },
        data: {
          status: WithdrawalStatus.paid,
          walletTransactionId: 'tx-debit-1',
        },
      });
      const logged = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0],
      );
      expect(logged.audit).toBe('wallet.withdrawal.paid');
    });
    it('throws businessRule if status is not approved', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: WithdrawalStatus.requested,
      });
      await expect(
        service.markWithdrawalPaid('system', 'wr-1', 'idem-paid-2'),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });
  });
  describe('rejectWithdrawal', () => {
    it('updates status to rejected, sets rejectionReason, emits audit', async () => {
      prisma.withdrawalRequest.update.mockResolvedValue({ id: 'wr-1' });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});
      await service.rejectWithdrawal('admin-1', 'wr-1', 'duplicate');
      expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith({
        where: { id: 'wr-1' },
        data: {
          status: WithdrawalStatus.rejected,
          rejectionReason: 'duplicate',
        },
      });
      const logged = JSON.parse(logSpy.mock.calls[0][0]);
      expect(logged.audit).toBe('wallet.withdrawal.reviewed');
      expect(logged.decision).toBe('rejected');
    });
  });
  describe('listAllWithdrawals', () => {
    it('applies optional status filter', async () => {
      prisma.withdrawalRequest.findMany.mockResolvedValue([]);
      await service.listAllWithdrawals(
        WithdrawalStatus.requested,
        undefined,
        20,
      );
      expect(prisma.withdrawalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: WithdrawalStatus.requested },
        }),
      );
    });
    it('no filter when status undefined', async () => {
      prisma.withdrawalRequest.findMany.mockResolvedValue([]);
      await service.listAllWithdrawals(undefined, undefined, 20);
      expect(prisma.withdrawalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
