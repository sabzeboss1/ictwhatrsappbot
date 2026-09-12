import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('super_secret_jwt_key_ict_whatsapp_2026_change_in_prod'),

  // IA
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-20241022'),

  // Evolution API
  EVOLUTION_API_URL: z.string().default('http://localhost:8080'),
  EVOLUTION_API_KEY: z.string().default('B6D711FCDE4D4FD5936544120E713976'),
  EVOLUTION_INSTANCE_NAME: z.string().default('ict-main'),
  EVOLUTION_WEBHOOK_SECRET: z.string().default('ict_evolution_secret_token_2026'),

  // HubSpot
  HUBSPOT_ACCESS_TOKEN: z.string().optional().default(''),
  HUBSPOT_PIPELINE_ID: z.string().default('default'),

  CORS_ORIGIN: z.string().default('*'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
