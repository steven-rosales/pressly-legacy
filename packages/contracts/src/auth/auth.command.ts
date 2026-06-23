import type { z } from 'zod';
import type { loginRequestSchema } from './auth.contracts.ts';

export type LoginRequest = z.infer<typeof loginRequestSchema>;
