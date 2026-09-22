import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'],
});

const MAILHOG_API = 'http://localhost:58025/api/v2';

const TABLES = [
  'content_reports',
  'verified_badges',
  'admin_audit_logs',
  'admin_invites',
  'notifications',
  'notification_preferences',
  'push_devices',
  'milestone_notification_logs',
  'otp_codes',
  'campaign_photos',
  'campaigns',
  'refresh_tokens',
  'social_identities',
  'admin_two_factor',
  'agency_reviews',
  'agency_documents',
  'agency_staff',
  'agencies',
  'trip_requests',
  'smart_reply_templates',
  'traveler_previous_trip_photos',
  'traveler_destination_preferences',
  'traveler_travel_style_preferences',
  'traveler_profiles',
  'post_likes',
  'comment_likes',
  'comments',
  'posts',
  'story_likes',
  'story_views',
  'stories',
  'friend_requests',
  'message_receipts',
  'messages',
  'conversation_participants',
  'conversations',
  'media_assets',
  'donations',
  'wallet_transactions',
  'withdrawal_requests',
  'wallet_accounts',
  'fraud_flags',
  'users',
];

export async function resetDb(): Promise<void> {
  // Terminate all other connections to the test database to prevent
  // deadlocks with the app's Prisma connection pool, which may hold
  // AccessShareLocks that conflict with TRUNCATE's AccessExclusiveLock.
  await prisma.$executeRawUnsafe(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database()
    AND pid <> pg_backend_pid()
  `);

  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE;`,
      );
      break;
    } catch (err: any) {
      const code = err?.code;
      if (code === '40P01' && attempt < maxAttempts) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  await fetch(MAILHOG_API.replace('/api/v2', '/api/v1') + '/messages', {
    method: 'DELETE',
  }).catch(() => {});
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma as testPrisma };
