import {
  defineEventStreamCatalog,
  defineHttpCatalog,
  type ExecutableCell,
  type ExecutableEventStreamCatalog,
  type ExecutableHttpCatalog,
  type ExecutableSubscriptionCell,
  type HttpBoundaryProfile,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { presslyTopology } from '../../pressly.topology.js';
import {
  presslyHttpBoundaryBindings,
  presslyHttpBoundaryProfiles,
} from '../../pressly-http-boundaries.js';
import type { ApiTargetOwners } from './bootstrap/target-owners.js';

type HttpCatalogOwners = Readonly<{
  'experience:control': ApiTargetOwners['experiences']['control'];
  'experience:customer': ApiTargetOwners['experiences']['customer'];
  'experience:processor': ApiTargetOwners['experiences']['processor'];
  'system:ingress': ApiTargetOwners['systems']['ingress'];
  'system:orders': ApiTargetOwners['systems']['orders'];
  'system:pricing': ApiTargetOwners['systems']['pricing'];
  'system:production': ApiTargetOwners['systems']['production'];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isExecutableCell = (value: unknown): value is ExecutableCell =>
  isRecord(value) &&
  value['kind'] !== 'subscription' &&
  typeof value['execute'] === 'function';

const isExecutableSubscriptionCell = (
  value: unknown,
): value is ExecutableSubscriptionCell =>
  isRecord(value) &&
  value['kind'] === 'subscription' &&
  typeof value['open'] === 'function';

const finiteCells = (owner: { readonly cells: object }): ExecutableCell[] =>
  Object.values(owner.cells).filter(isExecutableCell);

const subscriptionCells = (owner: {
  readonly cells: object;
}): ExecutableSubscriptionCell[] =>
  Object.values(owner.cells).filter(isExecutableSubscriptionCell);

const profileById = new Map(
  presslyHttpBoundaryProfiles.map((profile) => [profile.id, profile]),
);

const profileForBinding = (binding: {
  readonly operationId: string;
  readonly profileId: string;
}): readonly [string, HttpBoundaryProfile] => {
  const profile = profileById.get(binding.profileId);
  if (profile !== undefined) return [binding.operationId, profile];

  throw invariantViolationError({
    code: 'http_boundary_profile_missing',
    message: `HTTP boundary profile "${binding.profileId}" is missing from the handwritten topology.`,
    safeMessage: 'HTTP boundary configuration is invalid.',
  });
};

/** Boundary policy is handwritten topology data, keyed for the generic host. */
export const presslyHttpBoundaryProfilesByOperation = Object.freeze(
  Object.fromEntries(presslyHttpBoundaryBindings.map(profileForBinding)),
);

const uniqueTokens = (tokens: readonly (string | null | undefined)[]) =>
  Object.freeze(
    [
      ...new Set(
        tokens.filter(
          (token): token is string => token !== null && token !== undefined,
        ),
      ),
    ].sort(),
  );

export const httpBoundaryProviderTokens = Object.freeze({
  middleware: uniqueTokens(
    presslyHttpBoundaryProfiles.flatMap((profile) => [
      profile.authentication?.provider,
      profile.requestBody?.parser,
      profile.exactOrigin,
      profile.csrf,
      profile.requestRateLimit,
      profile.identityRateLimit,
    ]),
  ),
  context: uniqueTokens(
    presslyHttpBoundaryProfiles.flatMap((profile) => profile.contextProviders),
  ),
  authorization: uniqueTokens(
    presslyHttpBoundaryProfiles.map((profile) => profile.authorization),
  ),
  expectedFailure: uniqueTokens(
    presslyHttpBoundaryProfiles.map(
      (profile) => profile.expectedFailureObservation,
    ),
  ),
});

const httpCatalogCells = (
  owners: HttpCatalogOwners,
): readonly ExecutableCell[] =>
  Object.freeze([
    ...finiteCells(owners['experience:control']),
    ...finiteCells(owners['experience:customer']),
    ...finiteCells(owners['experience:processor']),
    ...finiteCells(owners['system:ingress']),
    ...finiteCells(owners['system:orders']),
    ...finiteCells(owners['system:pricing']),
    ...finiteCells(owners['system:production']),
  ]);

export const makeHttpCatalogFromOwners = (
  owners: HttpCatalogOwners,
): ExecutableHttpCatalog =>
  defineHttpCatalog(
    httpCatalogCells(owners),
    presslyHttpBoundaryProfilesByOperation,
  );

export const makeEventStreamCatalogFromOwners = (
  owners: Readonly<{
    'system:production': ApiTargetOwners['systems']['production'];
  }>,
): ExecutableEventStreamCatalog =>
  defineEventStreamCatalog(subscriptionCells(owners['system:production']));

/** A read-only route inventory for release smoke checks. */
export const httpRouteManifest = Object.freeze(
  [...presslyTopology.systems, ...presslyTopology.experiences].flatMap(
    (owner) =>
      owner.cells.flatMap((manifest) =>
        manifest.surfaces.flatMap((surface) =>
          surface.kind === 'http'
            ? [
                Object.freeze({
                  operationId: manifest.id,
                  method: surface.method,
                  path: surface.path,
                }),
              ]
            : [],
        ),
      ),
  ),
);
