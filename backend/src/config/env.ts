import { z } from 'zod';
import { checkInfraRequirements, resolveRedisEnabled } from './infrastructure.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('Eaz Community'),
  APP_PORT: z.coerce.number().int().positive().default(5000),
  APP_URL: z.string().url().default('http://localhost:5000'),
  API_URL: z.string().url().default('http://localhost:5000/api/v1'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  MONGODB_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  // Optional on purpose: when unset, the effective value is derived from
  // NODE_ENV (off in dev/test, on in staging/production). See infrastructure.ts.
  REDIS_ENABLED: z.enum(['true', 'false']).optional(),
  TYPESENSE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TYPESENSE_URL: z.string().url().default('http://localhost:8108'),
  TYPESENSE_API_KEY: z.string().default('dev-typesense-key'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Express `trust proxy` setting so rate limiters key on the real client IP
  // when behind a proxy (Nginx, Phase 7). Off by default: enabling it without a
  // trusted proxy in front lets clients spoof X-Forwarded-For to evade limits.
  // Values: 'false' | 'true' | a hop count ('1') | a preset/subnet ('loopback').
  TRUST_PROXY: z.string().default('false'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  OTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
  OTP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3),
  CHANNEL_POST_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  CHANNEL_POST_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  OTP_EXPIRES_IN_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AFRICASTALKING_API_KEY: z.string().default(''),
  AFRICASTALKING_USERNAME: z.string().default('sandbox'),
  AFRICASTALKING_SENDER_ID: z.string().default(''),
  SMS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  AVATAR_MAX_SIZE_MB: z.coerce.number().positive().default(5),
  E2EE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  E2EE_PRE_KEY_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  E2EE_ONE_TIME_PRE_KEY_BATCH_SIZE: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Resolve the effective Redis mode from NODE_ENV + the optional flag, then
// enforce the environment's hard requirements (production must have Redis).
const redisEnabled = resolveRedisEnabled(parsed.data.NODE_ENV, parsed.data.REDIS_ENABLED);
const infraError = checkInfraRequirements(parsed.data.NODE_ENV, redisEnabled);
if (infraError) {
  console.error('Invalid environment configuration:', infraError);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Overrides the raw 'true'|'false'|undefined with the resolved boolean.
  REDIS_ENABLED: redisEnabled,
};

export type Env = typeof env;
