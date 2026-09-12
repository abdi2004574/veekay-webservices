import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MAILHOG_API = 'http://localhost:58025/api/v2';

// Use actual PostgreSQL table names (Prisma uses snake_case plural by default)
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
  const maxAttempts = 5;
  const delayMs = 50;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE;`,
      );
      break;
    } catch (err: any) {
      const code = err?.code;
      if (code === '40P01' && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  // Clear Mailhog emails to prevent stale OTP codes from previous tests
  await fetch('http://localhost:58025/api/v1/messages', { method: 'DELETE' }).catch(() => {});
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma as testPrisma };
