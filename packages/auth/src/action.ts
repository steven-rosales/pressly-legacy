import type { Permission } from './permission.ts';

export type Action = Permission | 'auth:login' | 'auth:logout';
