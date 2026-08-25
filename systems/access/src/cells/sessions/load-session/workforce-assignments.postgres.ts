import {
  businessScope,
  isRole,
  locationScope,
  type RoleAssignment,
} from '../../../model/authorization/public.ts';

export const mapStoredWorkforceAssignments = (
  rows: readonly {
    role: string;
    scopeKind: string;
    scopeId: string;
    startsAt: Date | null;
    endsAt: Date | null;
    state: 'active' | 'revoked' | 'expired';
    version: number;
  }[],
): RoleAssignment[] =>
  rows.flatMap((row) => {
    if (!isRole(row.role)) return [];
    const scope =
      row.scopeKind === 'business'
        ? businessScope(row.scopeId)
        : row.scopeKind === 'location'
          ? locationScope(row.scopeId)
          : null;
    if (scope === null) return [];
    return [
      {
        role: row.role,
        scope,
        state: row.state,
        version: row.version,
        ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
        ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
      },
    ];
  });
