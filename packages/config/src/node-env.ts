import { z } from 'zod';

export const nodeEnvSchema = z.enum(['dev', 'test', 'production']);

export type NodeEnv = z.infer<typeof nodeEnvSchema>;
