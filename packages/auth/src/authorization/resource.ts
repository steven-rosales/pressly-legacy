import type { Scope } from './scope.ts';

export type AuthResource = Readonly<{
  kind: string;
  scope: Scope;
  id?: string;
  attributes?: Readonly<Record<string, unknown>>;
}>;
