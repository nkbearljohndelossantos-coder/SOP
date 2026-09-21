import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./sop_dev.db'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  ENABLE_DEMO_ACCOUNTS: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE: z.coerce.number().default(15728640),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment configuration error:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;

// Strict Production check
export const isProduction = env.APP_ENV === 'production';
export const allowDemoAccounts = !isProduction && env.ENABLE_DEMO_ACCOUNTS;
