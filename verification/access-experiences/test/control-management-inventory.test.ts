import {
  controlCellDeclarations,
  controlManagementCellDeclarations,
} from '@pressly/experience-control/testing/assembly';
import { controlManagementBoundaryRequirements } from '@pressly/experience-control/testing/management-boundaries';
import { resolveControlAccessCellDeclaration } from '@pressly/experience-control/operations/access/resolve-access/cell';
import { describe, expect, it } from 'vitest';
import {
  controlManagementExperienceRoutes,
  verifyControlManagementExperience,
} from '../src/public.ts';

describe('Control administration migration inventory', () => {
  it('maps 23 durable projections to 27 HTTP cells within the 47-cell Control assembly', () => {
    expect(verifyControlManagementExperience()).toEqual({
      routeCount: 27,
      targetOperationCount: 27,
      projectionCount: 23,
      issues: [],
    });
    expect(Object.values(controlManagementCellDeclarations)).toHaveLength(27);
    expect(Object.values(controlCellDeclarations)).toHaveLength(47);
    expect(resolveControlAccessCellDeclaration.surfaces).toEqual([]);
  });

  it('keeps every route contract versioned and bound to one exact profile', () => {
    expect(controlManagementBoundaryRequirements).toHaveLength(27);
    expect(controlManagementExperienceRoutes).toHaveLength(27);
    for (const declaration of Object.values(
      controlManagementCellDeclarations,
    )) {
      expect(declaration.contract).toMatchObject({
        input: { version: 1 },
        output: { version: 1 },
        failure: { version: 1 },
      });
      expect(declaration.surfaces).toHaveLength(1);
    }
    expect(
      new Set(controlManagementExperienceRoutes.map((route) => route.profileId))
        .size,
    ).toBe(27);
  });
});
