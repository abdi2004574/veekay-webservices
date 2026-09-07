import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import { resetDb, disconnectDb, testPrisma } from './utils/reset-db';
import { resetRedis, disconnectRedis } from './utils/reset-redis';
import { clearMailhog } from './utils/mailhog';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { registerApprovedAgency } from './utils/register-agency';
import { registerAndLoginAdmin } from './utils/register-admin';
import { Decimal } from '@prisma/client/runtime/library';

describe('Wallet (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDb();
    await disconnectRedis();
  });

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
    await clearMailhog();
  });

  const server = () => app.getHttpServer();

  const IDK = (s: string) => `idem-e2e-${s}`;

  describe('GET /me/wallet', () => {
    it('returns a zero-balance wallet for a new traveler (auto-creates)', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-wallet-1@test.com', 'T1');

      const res = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data.balance).toBe(0);
      expect(res.body.data.currency).toBe('USD');
    });

    it('reflects the updated balance after an admin credit', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-wallet-2@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('credit1'))
        .send({ amount: 100, currency: 'USD', description: 'seed' })
        .expect(200);

      const res = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data.balance).toBe(100);
    });

    it('returns 401 without auth', async () => {
      await request(server()).get('/api/v1/me/wallet').expect(401);
    });
  });

  describe('GET /me/wallet/transactions', () => {
    it('is empty for a fresh wallet', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-wtx-1@test.com', 'T1');
      const res = await request(server())
        .get('/api/v1/me/wallet/transactions')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.nextCursor).toBeNull();
    });

    it('lists transactions after an admin credit', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-wtx-2@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('credit2'))
        .send({ amount: 50, currency: 'USD', description: 'credit' })
        .expect(200);

      const res = await request(server())
        .get('/api/v1/me/wallet/transactions')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].direction).toBe('credit');
      expect(res.body.data.items[0].amount).toBe('50');
    });

    it('paginates with cursor', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-wtx-3@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      for (let i = 0; i < 3; i++) {
        await request(server())
          .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
          .set('Authorization', `Bearer ${admin.adminAccessToken}`)
          .set('idempotency-key', IDK(`c${i}`))
          .send({ amount: 10, currency: 'USD', description: `credit ${i}` })
          .expect(200);
      }

      const firstRes = await request(server())
        .get('/api/v1/me/wallet/transactions?limit=2')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(firstRes.body.data.items).toHaveLength(2);
      expect(firstRes.body.data.nextCursor).toBeDefined();

      const secondRes = await request(server())
        .get(`/api/v1/me/wallet/transactions?limit=2&cursor=${firstRes.body.data.nextCursor as string}`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);

      expect(secondRes.body.data.items).toHaveLength(1);
      expect(secondRes.body.data.nextCursor).toBeNull();
    });
  });

  // ===== Block 1 — Admin credit =====
  describe('POST /admin/wallet/wallets/:userId/credit', () => {
    it('returns 403 when a traveler calls the admin credit endpoint', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-403@test.com', 'T1');
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .set('idempotency-key', IDK('credit403'))
        .send({ amount: 50, currency: 'USD' })
        .expect(403);
    });

    it('returns 404 when admin credits an unknown user id', async () => {
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post('/api/v1/admin/wallet/wallets/00000000-0000-0000-0000-000000000000/credit')
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('creditUnknown'))
        .send({ amount: 50, currency: 'USD' })
        .expect(404);
    });

    it('returns 404 when admin credits a deactivated user', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-deact@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);
      await testPrisma.user.update({
        where: { id: traveler.userId },
        data: { isActive: false },
      });
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('creditDeact'))
        .send({ amount: 50, currency: 'USD' })
        .expect(404);
    });

    it('returns 400 without Idempotency-Key header', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-noIdk@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .send({ amount: 50, currency: 'USD' })
        .expect(400);
    });

    it('returns 400 for amount <= 0', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-neg@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('creditNeg'))
        .send({ amount: 0, currency: 'USD' })
        .expect(400);
    });

    it('happy path: credits balance, writes ledger row, balance reflects it', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-happy@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      const creditRes = await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('creditHappy'))
        .send({ amount: 250, currency: 'USD', description: 'manual test credit' })
        .expect(200);
      expect(creditRes.body.data.amount).toBe('250');

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(250);

      const ledgerRow = await testPrisma.walletTransaction.findFirst({
        where: { walletAccount: { userId: traveler.userId } },
        orderBy: { createdAt: 'desc' },
      });
      expect(ledgerRow).not.toBeNull();
      expect(ledgerRow?.direction).toBe('credit');
      expect(Number(ledgerRow?.amount.toString())).toBe(250);
      expect(ledgerRow?.type).toBe('donation_received');
      expect(ledgerRow?.referenceType).toBe('manual_admin_credit');
    });

    it('idempotency replay: same key + same body returns original, no double credit', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-replay@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      const key = IDK('creditReplaySame');
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', key)
        .send({ amount: 100, currency: 'USD', description: 'first' })
        .expect(200);

      const replay = await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', key)
        .send({ amount: 100, currency: 'USD', description: 'first' })
        .expect(200);

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(100);

      const ledgerCount = await testPrisma.walletTransaction.count({
        where: { walletAccount: { userId: traveler.userId } },
      });
      expect(ledgerCount).toBe(1);

      const original = await testPrisma.walletTransaction.findFirst({
        where: { walletAccount: { userId: traveler.userId } },
      });
      expect(replay.body.data.id).toBe(original?.id);
    });

    it('idempotency replay: same key + different body returns ORIGINAL transaction, NOT 409', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-credit-replay2@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);

      const key = IDK('creditReplayDiff');
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', key)
        .send({ amount: 100, currency: 'USD', description: 'original' })
        .expect(200);

      const replay = await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', key)
        .send({ amount: 999, currency: 'USD', description: 'should be ignored' })
        .expect(200);

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(100);

      expect(Number(replay.body.data.amount.toString())).toBe(100);
    });
  });

  // ===== Block 2 — Withdrawal request =====
  describe('POST /me/wallet/withdrawals', () => {
    async function seedBalance(email: string, amount: number): Promise<string> {
      const traveler = await registerAndVerifyTraveler(server, email, 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK(`seed-${email}`))
        .send({ amount, currency: 'USD' })
        .expect(200);
      return traveler.accessToken;
    }

    it('returns 422 when balance is insufficient', async () => {
      const accessToken = await seedBalance('t-wd-insuf@test.com', 50);
      await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('idempotency-key', IDK('wdInsuf'))
        .send({ amount: 100, currency: 'USD' })
        .expect(422);
    });

    it('returns 400 without Idempotency-Key header', async () => {
      const accessToken = await seedBalance('t-wd-noIdk@test.com', 200);
      await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 50, currency: 'USD' })
        .expect(400);
    });

    it('returns 422 on currency mismatch', async () => {
      const accessToken = await seedBalance('t-wd-cur@test.com', 200);
      await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('idempotency-key', IDK('wdCur'))
        .send({ amount: 50, currency: 'EUR' })
        .expect(422);
    });

    it('happy path: creates requested, balance unchanged (debit waits on mark-paid)', async () => {
      const accessToken = await seedBalance('t-wd-happy@test.com', 500);

      const createRes = await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('idempotency-key', IDK('wdHappy'))
        .send({ amount: 200, currency: 'USD' })
        .expect(201);
      expect(createRes.body.data.status).toBe('requested');
      expect(createRes.body.data.amount).toBe('200');

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(500);
    });

    it('agency with sufficient balance can create a withdrawal', async () => {
      const { agencyAccessToken } = await registerApprovedAgency(server, 'a-wd@test.com', 'Agency WD');
      const admin = await registerAndLoginAdmin(server);
      const agencyUser = await testPrisma.user.findFirstOrThrow({
        where: { email: 'a-wd@test.com' },
      });
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${agencyUser.id}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('seed-agency'))
        .send({ amount: 300, currency: 'USD' })
        .expect(200);

      const createRes = await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${agencyAccessToken}`)
        .set('idempotency-key', IDK('wdAgency'))
        .send({ amount: 100, currency: 'USD' })
        .expect(201);
      expect(createRes.body.data.status).toBe('requested');
    });

    it('returns 403 when a traveler calls an admin withdrawal endpoint', async () => {
      const accessToken = await seedBalance('t-wd-403@test.com', 200);
      await request(server())
        .get('/api/v1/admin/wallet/withdrawals')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  // ===== Block 3 — My withdrawals =====
  describe('GET /me/wallet/withdrawals', () => {
    async function seedAndWithdraw(email: string, balance: number, withdraw: number): Promise<string> {
      const accessToken = await (async () => {
        const traveler = await registerAndVerifyTraveler(server, email, 'T1');
        const admin = await registerAndLoginAdmin(server);
        await request(server())
          .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
          .set('Authorization', `Bearer ${admin.adminAccessToken}`)
          .set('idempotency-key', IDK(`seed-${email}`))
          .send({ amount: balance, currency: 'USD' })
          .expect(200);
        return traveler.accessToken;
      })();
      await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('idempotency-key', IDK(`wd-${email}`))
        .send({ amount: withdraw, currency: 'USD' })
        .expect(201);
      return accessToken;
    }

    it('returns an empty list for a new traveler', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-mwd-empty@test.com', 'T1');
      const res = await request(server())
        .get('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.nextCursor).toBeNull();
    });

    it('lists own withdrawals only (cross-user isolation)', async () => {
      const aToken = await seedAndWithdraw('t-mwd-a@test.com', 500, 100);
      const bToken = await seedAndWithdraw('t-mwd-b@test.com', 500, 200);

      const aRes = await request(server())
        .get('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${aToken}`)
        .expect(200);
      expect(aRes.body.data.items).toHaveLength(1);
      expect(aRes.body.data.items[0].amount).toBe('100');

      const bRes = await request(server())
        .get('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${bToken}`)
        .expect(200);
      expect(bRes.body.data.items).toHaveLength(1);
      expect(bRes.body.data.items[0].amount).toBe('200');
    });

    it('returns 200 with detail for own withdrawal', async () => {
      const aToken = await seedAndWithdraw('t-mwd-detail@test.com', 500, 150);
      const listRes = await request(server())
        .get('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${aToken}`)
        .expect(200);
      const id = listRes.body.data.items[0].id;

      const detailRes = await request(server())
        .get(`/api/v1/me/wallet/withdrawals/${id}`)
        .set('Authorization', `Bearer ${aToken}`)
        .expect(200);
      expect(detailRes.body.data.id).toBe(id);
      expect(detailRes.body.data.status).toBe('requested');
    });

    it('returns 404 for another user' + "'" + 's withdrawal (no leak)', async () => {
      const aToken = await seedAndWithdraw('t-mwd-iso-a@test.com', 500, 100);
      const bToken = await seedAndWithdraw('t-mwd-iso-b@test.com', 500, 200);
      const aList = await request(server())
        .get('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${aToken}`)
        .expect(200);
      const aId = aList.body.data.items[0].id;

      await request(server())
        .get(`/api/v1/me/wallet/withdrawals/${aId}`)
        .set('Authorization', `Bearer ${bToken}`)
        .expect(404);
    });
  });

  // ===== Block 4 — Admin review =====
  describe('PATCH /admin/wallet/withdrawals/:id/review', () => {
    async function setupRequested(email: string, balance: number, withdraw: number): Promise<{ withdrawalId: string; travelerToken: string }> {
      const traveler = await registerAndVerifyTraveler(server, email, 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK(`seed-${email}`))
        .send({ amount: balance, currency: 'USD' })
        .expect(200);
      const createRes = await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .set('idempotency-key', IDK(`wd-${email}`))
        .send({ amount: withdraw, currency: 'USD' })
        .expect(201);
      return { withdrawalId: createRes.body.data.id, travelerToken: traveler.accessToken };
    }

    it('admin approves a requested withdrawal, balance unchanged (debit waits on mark-paid)', async () => {
      const { withdrawalId, travelerToken } = await setupRequested('t-rev-approve@test.com', 500, 200);
      const admin = await registerAndLoginAdmin(server);

      const res = await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('revApprove'))
        .send({ decision: 'approved' })
        .expect(200);
      expect(res.body.data.status).toBe('approved');

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${travelerToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(500);
    });

    it('admin rejects a requested withdrawal with reason, status + reason stored', async () => {
      const { withdrawalId } = await setupRequested('t-rev-reject@test.com', 500, 200);
      const admin = await registerAndLoginAdmin(server);

      const res = await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('revReject'))
        .send({ decision: 'rejected', reason: 'Insufficient campaign completion.' })
        .expect(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectionReason).toBe('Insufficient campaign completion.');
    });

    it('returns 422 when reviewing an already-approved withdrawal', async () => {
      const { withdrawalId } = await setupRequested('t-rev-twice@test.com', 500, 200);
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('revApprove'))
        .send({ decision: 'approved' })
        .expect(200);

      await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('revApproveAgain'))
        .send({ decision: 'approved' })
        .expect(422);
    });

    it('returns 403 when traveler calls admin review', async () => {
      const { withdrawalId, travelerToken } = await setupRequested('t-rev-403@test.com', 500, 200);
      await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/review`)
        .set('Authorization', `Bearer ${travelerToken}`)
        .set('idempotency-key', IDK('revTraveler'))
        .send({ decision: 'approved' })
        .expect(403);
    });

    it('returns 400 without Idempotency-Key', async () => {
      const { withdrawalId } = await setupRequested('t-rev-noIdk@test.com', 500, 200);
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .send({ decision: 'approved' })
        .expect(400);
    });
  });

  // ===== Block 5 — Admin mark-paid =====
  describe('POST /admin/wallet/withdrawals/:id/mark-paid', () => {
    async function setupApproved(email: string): Promise<{ withdrawalId: string; travelerToken: string }> {
      const traveler = await registerAndVerifyTraveler(server, email, 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK(`seed-${email}`))
        .send({ amount: 500, currency: 'USD' })
        .expect(200);
      const wd = await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .set('idempotency-key', IDK(`wd-${email}`))
        .send({ amount: 200, currency: 'USD' })
        .expect(201);
      await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${wd.body.data.id}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK(`rev-${email}`))
        .send({ decision: 'approved' })
        .expect(200);
      return { withdrawalId: wd.body.data.id, travelerToken: traveler.accessToken };
    }

    it('marks approved withdrawal paid, debits balance, writes debit tx, sets walletTransactionId', async () => {
      const { withdrawalId, travelerToken } = await setupApproved('t-paid-happy@test.com');
      const admin = await registerAndLoginAdmin(server);

      const res = await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('paidHappy'))
        .expect(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.walletTransactionId).toBeDefined();

      const wallet = await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${travelerToken}`)
        .expect(200);
      expect(wallet.body.data.balance).toBe(300);

      const debitTx = await testPrisma.walletTransaction.findFirst({
        where: { walletAccount: { userId: (await testPrisma.user.findFirstOrThrow({ where: { email: 't-paid-happy@test.com' } })).id }, direction: 'debit' },
      });
      expect(debitTx).not.toBeNull();
      expect(Number(debitTx?.amount.toString())).toBe(200);
      expect(debitTx?.type).toBe('withdrawal');

      const wdRow = await testPrisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalId } });
      expect(wdRow.walletTransactionId).toBe(debitTx?.id);
    });

    it('returns 422 when marking a requested (not approved) withdrawal as paid', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-paid-req@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('seed-paid-req'))
        .send({ amount: 500, currency: 'USD' })
        .expect(200);
      const wd = await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .set('idempotency-key', IDK('wd-paid-req'))
        .send({ amount: 100, currency: 'USD' })
        .expect(201);

      await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${wd.body.data.id}/mark-paid`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('paidReq'))
        .expect(422);
    });

    it('returns 422 when marking an already-paid withdrawal as paid again', async () => {
      const { withdrawalId } = await setupApproved('t-paid-twice@test.com');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('paidTwice1'))
        .expect(200);

      await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('paidTwice2'))
        .expect(422);
    });

    it('returns 400 without Idempotency-Key', async () => {
      const { withdrawalId } = await setupApproved('t-paid-noIdk@test.com');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .expect(400);
    });

    it('returns 403 when traveler calls admin mark-paid', async () => {
      const { withdrawalId, travelerToken } = await setupApproved('t-paid-403@test.com');
      await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${travelerToken}`)
        .set('idempotency-key', IDK('paid403'))
        .expect(403);
    });
  });

  // ===== Block 6 — Transaction list =====
  describe('GET /me/wallet/transactions (filters + isolation)', () => {
    it('type=donation_received shows only credits, type=withdrawal shows only debits', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-tx-filter@test.com', 'T1');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('txFilterSeed'))
        .send({ amount: 500, currency: 'USD' })
        .expect(200);
      const wd = await request(server())
        .post('/api/v1/me/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .set('idempotency-key', IDK('txFilterWd'))
        .send({ amount: 100, currency: 'USD' })
        .expect(201);
      await request(server())
        .patch(`/api/v1/admin/wallet/withdrawals/${wd.body.data.id}/review`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('txFilterRev'))
        .send({ decision: 'approved' })
        .expect(200);
      await request(server())
        .post(`/api/v1/admin/wallet/withdrawals/${wd.body.data.id}/mark-paid`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('txFilterPaid'))
        .expect(200);

      const creditOnly = await request(server())
        .get('/api/v1/me/wallet/transactions?type=donation_received')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(creditOnly.body.data.items).toHaveLength(1);
      expect(creditOnly.body.data.items[0].direction).toBe('credit');

      const debitOnly = await request(server())
        .get('/api/v1/me/wallet/transactions?type=withdrawal')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(debitOnly.body.data.items).toHaveLength(1);
      expect(debitOnly.body.data.items[0].direction).toBe('debit');

      const allTx = await request(server())
        .get('/api/v1/me/wallet/transactions')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(200);
      expect(allTx.body.data.items).toHaveLength(2);
    });

    it('cross-user isolation: another traveler' + "'" + 's txs never appear', async () => {
      const a = await registerAndVerifyTraveler(server, 't-tx-iso-a@test.com', 'A');
      const b = await registerAndVerifyTraveler(server, 't-tx-iso-b@test.com', 'B');
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .post(`/api/v1/admin/wallet/wallets/${b.userId}/credit`)
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .set('idempotency-key', IDK('txIsoB'))
        .send({ amount: 50, currency: 'USD' })
        .expect(200);

      const aList = await request(server())
        .get('/api/v1/me/wallet/transactions')
        .set('Authorization', `Bearer ${a.accessToken}`)
        .expect(200);
      expect(aList.body.data.items).toEqual([]);

      const bList = await request(server())
        .get('/api/v1/me/wallet/transactions')
        .set('Authorization', `Bearer ${b.accessToken}`)
        .expect(200);
      expect(bList.body.data.items).toHaveLength(1);
      expect(bList.body.data.items[0].direction).toBe('credit');
    });
  });

  // ===== Block 7 — Role guards =====
  describe('Role guards', () => {
    it('admin role is blocked from /me/wallet (RoleGuard allows only traveler/agency)', async () => {
      const admin = await registerAndLoginAdmin(server);
      await request(server())
        .get('/api/v1/me/wallet')
        .set('Authorization', `Bearer ${admin.adminAccessToken}`)
        .expect(403);
    });

    it('traveler is blocked from /admin/wallet/* (PlatformRoleGuard)', async () => {
      const traveler = await registerAndVerifyTraveler(server, 't-role-iso@test.com', 'T1');
      await request(server())
        .get('/api/v1/admin/wallet/withdrawals')
        .set('Authorization', `Bearer ${traveler.accessToken}`)
        .expect(403);
    });
  });

});