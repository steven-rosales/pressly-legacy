import type { AccessGrantEntity } from './access-grant.entity.ts';

export type AccessGrantSummary = AccessGrantEntity &
  Readonly<{ effective: boolean }>;
