import type { z } from 'zod';
import type {
  authPrincipalSchema,
  loginResultSchema,
  logoutResultSchema,
  sessionResultSchema,
} from './auth.contracts.ts';

export type AuthPrincipalResult = z.infer<typeof authPrincipalSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type SessionResult = z.infer<typeof sessionResultSchema>;
export type LogoutResult = z.infer<typeof logoutResultSchema>;
