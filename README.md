# Veakay Backend

NestJS API for the Veakay travel-fundraising platform.

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d
npm run prisma:migrate
npm run start:dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | TypeScript build to `dist/` |
| `npm run start` | Start production build |
| `npm run start:dev` | Dev server with hot reload |
| `npm run test` | Unit tests (Jest) |
| `npm run test:e2e` | E2E tests (Jest, `--runInBand`) |
| `npm run prisma:migrate` | Apply Prisma migrations |

## API

- Base URL: `http://localhost:57800/api/v1`
- Swagger: `http://localhost:57800/api/v1/docs`
- Health: `http://localhost:57800/health`

## Stack

- NestJS 11 + TypeScript 5
- Prisma 6 + PostgreSQL 17
- Redis 7 (caching, BullMQ queues)
- Stripe Connect (payments)
- Firebase Admin SDK (push notifications)
- MailHog (dev email)
- MinIO (S3-compatible storage)
