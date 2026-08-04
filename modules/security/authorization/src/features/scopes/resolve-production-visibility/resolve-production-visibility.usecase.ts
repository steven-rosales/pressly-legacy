import { isAssignmentActive } from '@pressly/auth/authorization';
import type { Clock } from '@pressly/time';
import type { LocationAncestryPort } from '../../../foundations/ports/location-ancestry/location-ancestry.port.ts';
import type {
  ProductionLocationVisibility,
  ResolveProductionVisibilityInput,
} from './resolve-production-visibility.model.ts';

export type ResolveProductionVisibility = (
  input: ResolveProductionVisibilityInput,
) => Promise<ProductionLocationVisibility>;

const productionRoles = new Set(['owner', 'manager', 'admin', 'operator']);

export const makeResolveProductionVisibility =
  (deps: {
    ancestry: Pick<LocationAncestryPort, 'listLocationIdsForBusinesses'>;
    clock: Clock;
  }): ResolveProductionVisibility =>
  async ({ principalAttributes }) => {
    const now = deps.clock.now();
    const assignments = principalAttributes.assignments.filter(
      (assignment) =>
        productionRoles.has(assignment.role) &&
        isAssignmentActive(assignment, now),
    );

    if (assignments.some((assignment) => assignment.scope.kind === 'global'))
      return null;

    const directLocationIds = assignments.flatMap((assignment) =>
      assignment.scope.kind === 'location' ? [assignment.scope.id] : [],
    );
    const businessIds = [
      ...new Set(
        assignments.flatMap((assignment) =>
          assignment.scope.kind === 'business' ? [assignment.scope.id] : [],
        ),
      ),
    ];
    const inheritedLocationIds =
      businessIds.length === 0
        ? []
        : await deps.ancestry.listLocationIdsForBusinesses(businessIds);

    return [...new Set([...directLocationIds, ...inheritedLocationIds])].sort();
  };
