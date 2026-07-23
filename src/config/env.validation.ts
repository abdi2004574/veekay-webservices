import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(57800),
  APP_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis'] })
    .required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  GOOGLE_OAUTH_CLIENT_ID: Joi.string().allow('').optional(),
  APPLE_OAUTH_CLIENT_ID: Joi.string().allow('').optional(),

  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().required(),
  MAIL_FROM: Joi.string().required(),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASS: Joi.string().allow('').optional(),

  S3_ENDPOINT: Joi.string().uri().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().required(),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  FIREBASE_PROJECT_ID: Joi.string().allow('').optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow('').optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().allow('').optional(),

  STRIPE_SECRET_KEY: Joi.string().allow('').optional(),
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow('').optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  OTP_EXPIRY_MINUTES: Joi.number().default(10),
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().default(60),
  OTP_MAX_ATTEMPTS: Joi.number().default(5),
  LOGIN_LOCKOUT_THRESHOLD: Joi.number().default(5),
  LOGIN_LOCKOUT_MINUTES: Joi.number().default(15),

  LOG_LEVEL: Joi.string().default('info'),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),
}).unknown(true);
