import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ManualFundingProvider } from '../src/modules/wallet/funding/manual-funding.provider';
import { FUNDING_PROVIDER } from '../src/modules/wallet/interfaces/funding-provider.interface';
import { registerAndLoginAdmin } from './utils/register-admin';
import { registerAndVerifyTraveler } from './utils/register-traveler';
import { clearMailhog } from './utils/mailhog';
import { disconnectDb, resetDb } from './utils/reset-db';
import { disconnectRedis, resetRedis } from './utils/reset-redis';

describe('Wallet provider (production-config e2e)', () => {
  let app: INestApplication<App>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.STRIPE_SECRET_KEY = 'sk_test_production_regression';

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await disconnectDb();
    await disconnectRedis();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeKey;
    }
  });

  beforeEach(async () => {
    await resetDb();
    await resetRedis();
    await clearMailhog();
  });

  it('uses ManualFundingProvider and credits a wallet with a truthy Stripe key', async () => {
    const config = app.get(ConfigService);
    expect(config.get('nodeEnv')).toBe('production');
    expect(config.get('stripe.secretKey')).toBe(
      'sk_test_production_regression',
    );
    expect(app.get(FUNDING_PROVIDER)).toBeInstanceOf(ManualFundingProvider);

    const traveler = await registerAndVerifyTraveler(
      () => app.getHttpServer(),
      'production-provider@test.com',
      'Provider',
    );
    const admin = await registerAndLoginAdmin(() => app.getHttpServer());

    const credit = await request(app.getHttpServer())
      .post(`/api/v1/admin/wallet/wallets/${traveler.userId}/credit`)
      .set('Authorization', `Bearer ${admin.adminAccessToken}`)
      .set('idempotency-key', 'idem-production-provider')
      .send({ amount: 75, currency: 'USD', description: 'production config' })
      .expect(200);

    expect(credit.body.data).toMatchObject({
      direction: 'credit',
      amount: '75',
      currency: 'USD',
      referenceType: 'manual_admin_credit',
      referenceId: 'idem-production-provider',
    });

    const wallet = await request(app.getHttpServer())
      .get('/api/v1/me/wallet')
      .set('Authorization', `Bearer ${traveler.accessToken}`)
      .expect(200);
    expect(wallet.body.data.balance).toBe(75);
  });
});
