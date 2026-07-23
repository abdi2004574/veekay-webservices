export const blacklistKey = (jti: string) => `auth:blacklist:${jti}`;
export const otpResendCooldownKey = (identifier: string, type: string) =>
  `auth:otp-cooldown:${type}:${identifier}`;
export const loginAttemptsKey = (identifier: string) =>
  `auth:login-attempts:${identifier}`;
export const loginLockKey = (identifier: string) =>
  `auth:login-lock:${identifier}`;
