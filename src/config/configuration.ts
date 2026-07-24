export interface AppConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  database: { url: string };
  redis: { url: string };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  social: {
    googleClientId: string;
    appleClientId: string;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
  };
  storage: {
    endpoint: string;
    publicEndpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  otp: {
    expiryMinutes: number;
    resendCooldownSeconds: number;
    maxAttempts: number;
  };
  login: {
    lockoutThreshold: number;
    lockoutMinutes: number;
  };
  swaggerEnabled: boolean;
  throttle: {
    ttlMs: number;
    limit: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '57800', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:57800',
  database: {
    url: process.env.DATABASE_URL as string,
  },
  redis: {
    url: process.env.REDIS_URL as string,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  social: {
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    appleClientId: process.env.APPLE_OAUTH_CLIENT_ID ?? '',
  },
  mail: {
    host: process.env.MAIL_HOST as string,
    port: parseInt(process.env.MAIL_PORT ?? '1025', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM as string,
  },
  storage: {
    endpoint: process.env.S3_ENDPOINT as string,
    // Presigned URLs are signed against this host instead, since S3_ENDPOINT
    // inside docker-compose is the internal `minio:9000` hostname, which is
    // unreachable from a browser/mobile client outside the compose network.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? (process.env.S3_ENDPOINT as string),
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET as string,
    accessKey: process.env.S3_ACCESS_KEY as string,
    secretKey: process.env.S3_SECRET_KEY as string,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10),
    resendCooldownSeconds: parseInt(
      process.env.OTP_RESEND_COOLDOWN_SECONDS ?? '60',
      10,
    ),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  },
  login: {
    lockoutThreshold: parseInt(process.env.LOGIN_LOCKOUT_THRESHOLD ?? '5', 10),
    lockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES ?? '15', 10),
  },
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
