import { controlAuthBoundaryRequirements } from '@pressly/experience-control/testing/auth-boundaries';
import { controlAuthCellDeclarations } from '@pressly/experience-control/testing/assembly';
import { customerAuthBoundaryRequirements } from '@pressly/experience-customer/testing/auth-boundaries';
import { customerAuthCellDeclarations } from '@pressly/experience-customer/testing/assembly';
import {
  processorAuthBoundaryRequirements,
  processorAuthenticationCellDeclarations,
} from '@pressly/experience-processor/server';

export type AuthenticationRealm = 'control' | 'customer' | 'processor';

export type AuthenticationExperienceRoute = Readonly<{
  realm: AuthenticationRealm;
  operationId: string;
  method: string;
  path: string;
  bodyLimit: string | null;
  boundaryProfileId: string;
  requestBodyContentType: 'parse-if-matching' | 'required' | null;
  expectedFailureObservation: string | null;
}>;

const routes = (
  realm: AuthenticationRealm,
  declarations: Readonly<
    Record<
      string,
      Readonly<{
        id: string;
        surfaces: readonly Readonly<{
          kind: string;
          method?: string;
          path?: string;
          bodyLimit?: string | null;
        }>[];
      }>
    >
  >,
  requirements: readonly Readonly<{
    operationId: string;
    profile: Readonly<{
      id: string;
      requestBody: Readonly<{
        contentType?: 'parse-if-matching' | 'required';
      }> | null;
      expectedFailureObservation?: string | null;
    }>;
  }>[],
): readonly AuthenticationExperienceRoute[] => {
  const profiles = new Map(
    requirements.map((requirement) => [
      requirement.operationId,
      requirement.profile,
    ]),
  );
  return Object.values(declarations).flatMap((declaration) =>
    declaration.surfaces.flatMap((surface) =>
      surface.kind !== 'http' ||
      surface.method === undefined ||
      surface.path === undefined
        ? []
        : [
            Object.freeze({
              realm,
              operationId: declaration.id,
              method: surface.method,
              path: surface.path,
              bodyLimit: surface.bodyLimit ?? null,
              boundaryProfileId:
                profiles.get(declaration.id)?.id ?? '<missing>',
              requestBodyContentType:
                profiles.get(declaration.id)?.requestBody?.contentType ?? null,
              expectedFailureObservation:
                profiles.get(declaration.id)?.expectedFailureObservation ??
                null,
            }),
          ],
    ),
  );
};

export const authenticationExperienceRoutes = Object.freeze([
  ...routes(
    'customer',
    customerAuthCellDeclarations,
    customerAuthBoundaryRequirements,
  ),
  ...routes(
    'control',
    controlAuthCellDeclarations,
    controlAuthBoundaryRequirements,
  ),
  ...routes(
    'processor',
    processorAuthenticationCellDeclarations,
    processorAuthBoundaryRequirements,
  ),
]);

export type AuthenticationExperienceVerification = Readonly<{
  routeCount: number;
  realmCounts: Readonly<Record<AuthenticationRealm, number>>;
  issues: readonly string[];
}>;

export const verifyAuthenticationExperienceInventory =
  (): AuthenticationExperienceVerification => {
    const issues: string[] = [];
    const ids = new Set<string>();
    const bindings = new Set<string>();
    for (const route of authenticationExperienceRoutes) {
      if (ids.has(route.operationId))
        issues.push(`Duplicate operation ID: ${route.operationId}`);
      ids.add(route.operationId);
      const binding = `${route.method} ${route.path}`;
      if (bindings.has(binding)) issues.push(`Duplicate route: ${binding}`);
      bindings.add(binding);
      if (route.boundaryProfileId === '<missing>')
        issues.push(`Missing boundary profile: ${route.operationId}`);
    }

    const realmCounts = Object.freeze({
      customer: authenticationExperienceRoutes.filter(
        (route) => route.realm === 'customer',
      ).length,
      control: authenticationExperienceRoutes.filter(
        (route) => route.realm === 'control',
      ).length,
      processor: authenticationExperienceRoutes.filter(
        (route) => route.realm === 'processor',
      ).length,
    });
    if (realmCounts.customer !== 11)
      issues.push(
        `Expected 11 Customer routes, found ${realmCounts.customer}.`,
      );
    if (realmCounts.control !== 11)
      issues.push(`Expected 11 Control routes, found ${realmCounts.control}.`);
    if (realmCounts.processor !== 4)
      issues.push(
        `Expected 4 Processor routes, found ${realmCounts.processor}.`,
      );

    return Object.freeze({
      routeCount: authenticationExperienceRoutes.length,
      realmCounts,
      issues: Object.freeze(issues),
    });
  };
