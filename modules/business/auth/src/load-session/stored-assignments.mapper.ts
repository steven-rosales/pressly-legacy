import {
  businessScope,
  globalScope,
  locationScope,
  resourceScope,
  isRole,
  type RoleAssignment,
  type Scope,
} from '@pressly/auth/authorization';

const mapScope = (row: {
  scopeKind: string;
  scopeId: string;
  scopeResourceType: string;
}): Scope | undefined => {
  if (row.scopeKind === 'global') return globalScope();
  if (row.scopeKind === 'business') return businessScope(row.scopeId);
  if (row.scopeKind === 'location') return locationScope(row.scopeId);

  if (row.scopeKind === 'resource' && row.scopeResourceType !== '*')
    return resourceScope(row.scopeResourceType, row.scopeId);

  return undefined;
};

export const mapStoredAssignments = (
  rows: readonly {
    role: string;
    scopeKind: string;
    scopeId: string;
    scopeResourceType: string;
    startsAt: Date | null;
    endsAt: Date | null;
    state?: 'active' | 'revoked' | 'expired';
    version?: number;
  }[],
): RoleAssignment[] =>
  rows.flatMap((row) => {
    if (!isRole(row.role)) return [];

    const scope = mapScope(row);
    if (scope === undefined) return [];

    return [
      {
        role: row.role,
        scope,
        ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
        ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
        ...(row.state === undefined ? {} : { state: row.state }),
        ...(row.version === undefined ? {} : { version: row.version }),
      },
    ];
  });
