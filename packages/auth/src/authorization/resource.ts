import type { Scope } from './scope.ts';

export type AuthResource = Readonly<{
  kind: string;
  scope: Scope;
  /**
   * Canonical parent scopes resolved by a trusted boundary adapter.
   *
   * Policies may use these scopes to evaluate hierarchical assignments, but
   * callers must never infer ancestry from opaque identifiers.
   */
  ancestorScopes?: readonly Scope[];
  id?: string;
  attributes?: Readonly<Record<string, unknown>>;
}>;
