import { Throttle } from '@nestjs/throttler';

export const AuthRateLimit = () =>
  Throttle({ default: { limit: 10, ttl: 60_000 } });

export const OtpResendRateLimit = () =>
  Throttle({ default: { limit: 3, ttl: 300_000 } });

export const AdminRateLimit = () =>
  Throttle({ default: { limit: 200, ttl: 60_000 } });
