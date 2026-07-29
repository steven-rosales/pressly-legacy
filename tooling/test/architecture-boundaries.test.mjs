import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

const businessCapabilityRolePattern =
  /\.(?:command|controller|error|mapper|middleware|policy|port|repo|route|usecase)\.ts$/;

const moduleGroups = ['business', 'policy', 'computation'];

const moduleManifests = moduleGroups.flatMap((group) => {
  const groupRoot = path.join(repoRoot, 'modules', group);

  if (!existsSync(groupRoot)) return [];

  return readdirSync(groupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(groupRoot, entry.name, 'package.json'))
    .filter(existsSync);
});

const modulePackageNames = new Set(
  moduleManifests.map(
    (manifestPath) => JSON.parse(readFileSync(manifestPath, 'utf8')).name,
  ),
);

const readFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    return entry.isDirectory() ? readFiles(entryPath) : [entryPath];
  });

const importSpecifiers = (source) => [
  ...[...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  ),
  ...[...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map(
    (match) => match[1],
  ),
];

const relativeImportTarget = (filePath, specifier) =>
  path.resolve(path.dirname(filePath), specifier).replace(/\.js$/, '.ts');

const businessSourceRoots = (() => {
  const groupRoot = path.join(repoRoot, 'modules', 'business');

  if (!existsSync(groupRoot)) return [];

  return readdirSync(groupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(groupRoot, entry.name, 'src'))
    .filter(existsSync);
})();

const lint = async (filePath, source) => {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(repoRoot, filePath),
  });

  return result.messages.filter((message) => message.severity === 2);
};

const expectAllowed = async (filePath, source) => {
  expect(await lint(filePath, source)).toEqual([]);
};

const expectRejectedBy = async (filePath, source, ruleId) => {
  const messages = await lint(filePath, source);

  expect(messages.map((message) => message.ruleId)).toContain(ruleId);
};

describe('module architecture boundaries', () => {
  it('keeps real business capability files inside the closed role vocabulary', () => {
    const invalidFiles = businessSourceRoots.flatMap((sourceRoot) =>
      readFiles(sourceRoot)
        .map((filePath) => path.relative(sourceRoot, filePath))
        .filter(
          (relativePath) =>
            relativePath !== 'main.ts' &&
            relativePath !== 'public.ts' &&
            !['http', 'persistence'].includes(
              relativePath.split(path.sep)[0],
            ) &&
            !businessCapabilityRolePattern.test(relativePath),
        ),
    );

    expect(invalidFiles).toEqual([]);
  });

  it('allows a usecase to depend on a same-capability port', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/login.usecase.ts',
      `
        import type { LoginStore } from './login.port.ts';
        export type Login = LoginStore;
      `,
    );
  });

  it('allows persistence adapters to use the database and explicit persistence foundation', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/login.repo.ts',
      `
        import { auth } from '@pressly/db';
        import type { LoginStore } from './login.port.ts';
        import { toDatabaseResult } from '../persistence/database-result.ts';
        export const dependencies = { auth, toDatabaseResult };
        export type Store = LoginStore;
      `,
    );
  });

  it('allows access-control capabilities to use the explicit identity foundation', async () => {
    await expectAllowed(
      'modules/policy/access-control/src/mfa/mfa.guard.ts',
      `
        import { authIdentityResourceFromRequest } from '../identity/auth-identity.resource.ts';
        export const readResource = authIdentityResourceFromRequest;
      `,
    );
  });

  it('allows scheduling capabilities to use the explicit fixed-pulse foundation', async () => {
    await expectAllowed(
      'modules/computation/scheduling/src/forecast-demand/forecast-demand.computation.ts',
      `
        import { pulseCapacity } from '../fixed-pulse/fixed-pulse.computation.ts';
        export const capacity = pulseCapacity;
      `,
    );
  });

  it('allows the intentionally HTTP-shaped access-control auth port to import HTTP types', async () => {
    await expectAllowed(
      'modules/policy/access-control/src/auth.port.ts',
      `
        import type { Request, RequestHandler } from 'express';
        export type Authenticate = (request: Request) => RequestHandler;
      `,
    );
  });

  it('allows business ports to import mechanism-free application types', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/login.port.ts',
      `
        import type { AppError } from '@pressly/errors';
        export type LoginFailure = AppError;
      `,
    );
  });

  it('allows a capability to use narrow root ports and errors', async () => {
    await expectAllowed(
      'modules/business/production/src/create-schedule/create-schedule.usecase.ts',
      `
        import type { ProductionSchedulerPort } from '../production.port.ts';
        import { productionError } from '../production.error.ts';
        export const dependencies = { productionError };
        export type Scheduler = ProductionSchedulerPort;
      `,
    );
  });

  it('allows recursively nested capability files when their role is explicit', async () => {
    await expectAllowed(
      'modules/business/auth/src/login/internal/login.policy.ts',
      'export const canLogin = true;',
    );
  });

  it('allows only the explicit module composition surface without a role suffix', async () => {
    await expectAllowed(
      'modules/business/auth/src/main.ts',
      'export const composeModule = true;',
    );
    await expectAllowed(
      'modules/business/auth/src/public.ts',
      'export const publicSurface = true;',
    );
  });

  it('allows test vocabulary under the module test tree', async () => {
    await expectAllowed(
      'modules/business/auth/test/login/login.fake.ts',
      'export const fakeLogin = true;',
    );
    await expectAllowed(
      'modules/business/auth/test/login/login.usecase.test.ts',
      'export const usecaseTestFixture = true;',
    );
  });

  it('rejects database access from usecases', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.usecase.ts',
      `
        import { auth } from '@pressly/db';
        export const leakedDatabase = auth;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects imports between sibling capabilities', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.command.ts',
      `
        import { completeMfa } from '../mfa/complete-mfa.command.ts';
        export const command = completeMfa;
      `,
      'architecture/module-capability-imports',
    );
  });

  it('rejects dynamic imports between sibling capabilities', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.command.ts',
      `
        export const loadMfaCommand = () => import('../mfa/complete-mfa.command.ts');
      `,
      'architecture/module-capability-imports',
    );
  });

  it('rejects database types from business ports', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.port.ts',
      `
        import type { Database } from '@pressly/db';
        export type LoginStore = Database;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects UI types from computation ports', async () => {
    await expectRejectedBy(
      'modules/computation/scheduler/src/propose/propose.port.ts',
      `
        import type { ReactNode } from 'react';
        export type ScheduleProposal = ReactNode;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects module package imports from every module group', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.usecase.ts',
      `import type { PricingModule } from '@pressly/pricing'; export type Leak = PricingModule;`,
      'architecture/module-isolation',
    );
    await expectRejectedBy(
      'modules/policy/access-control/src/pricing/pricing.policy.ts',
      `import type { PricingModule } from '@pressly/pricing'; export type Leak = PricingModule;`,
      'architecture/module-isolation',
    );
    await expectRejectedBy(
      'modules/computation/scheduling/src/propose/propose.computation.ts',
      `import type { PricingModule } from '@pressly/pricing'; export type Leak = PricingModule;`,
      'architecture/module-isolation',
    );
  });

  it('rejects module package dependencies in manifests', () => {
    const violations = moduleManifests.flatMap((manifestPath) => {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const dependencyEntries = Object.entries({
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
        ...(manifest.optionalDependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
      });

      return dependencyEntries
        .filter(([dependency]) => modulePackageNames.has(dependency))
        .map(
          ([dependency]) =>
            `${path.relative(repoRoot, manifestPath)} -> ${dependency}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('keeps Users and Orders as isolated peer modules', async () => {
    await expectRejectedBy(
      'modules/business/users/src/observe-user/observe-user.usecase.ts',
      `import type { OrdersApplication } from '@pressly/orders'; export type Leak = OrdersApplication;`,
      'architecture/module-isolation',
    );
    await expectRejectedBy(
      'modules/business/orders/src/observe-order/observe-order.usecase.ts',
      `import type { UsersApplication } from '@pressly/users'; export type Leak = UsersApplication;`,
      'architecture/module-isolation',
    );
  });

  it('keeps Users and Orders persistence capability-shaped', () => {
    const sources = [
      path.join(repoRoot, 'modules/business/users/src'),
      path.join(repoRoot, 'modules/business/orders/src'),
    ].flatMap((sourceRoot) =>
      readFiles(sourceRoot).map((filePath) => ({
        filePath,
        source: readFileSync(filePath, 'utf8'),
      })),
    );
    const moduleWideRepositories = sources.flatMap(({ filePath, source }) =>
      /\b(?:UsersRepository|OrdersRepository|UserMutationRepository|UserMutationOperations|OrderOutboxRepository)\b/.test(
        source,
      )
        ? [path.relative(repoRoot, filePath)]
        : [],
    );

    expect(moduleWideRepositories).toEqual([]);
    expect(
      existsSync(
        path.join(
          repoRoot,
          'modules/business/users/src/persistence/postgres-users.ts',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          repoRoot,
          'modules/business/orders/src/persistence/postgres-orders.ts',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          repoRoot,
          'modules/business/users/src/canonical-source-user/canonical-source-user.repo.ts',
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          repoRoot,
          'modules/business/users/src/canonical-source-user/canonical-source-user.adapter.ts',
        ),
      ),
    ).toBe(false);
    for (const legacyAdapter of [
      'modules/business/users/src/user-mutations/user-mutations.repo.ts',
      'modules/business/users/src/user-mutations/user-mutations.port.ts',
      'modules/business/orders/src/order-mutations/order-mutations.repo.ts',
      'modules/business/orders/src/order-mutations/order-mutations.port.ts',
      'modules/business/orders/src/order-outbox/order-outbox.repo.ts',
      'modules/business/orders/src/order-outbox/order-outbox.port.ts',
    ])
      expect(existsSync(path.join(repoRoot, legacyAdapter))).toBe(false);
  });

  it('keeps the versioned Order integration event owned by contracts', () => {
    const contract = readFileSync(
      path.join(
        repoRoot,
        'packages/contracts/src/orders/fulfillment-demand-event.contracts.ts',
      ),
      'utf8',
    );
    const worker = readFileSync(
      path.join(
        repoRoot,
        'apps/worker/src/jobs/project-fulfillment-demand/fulfillment-demand.job.ts',
      ),
      'utf8',
    );

    expect(contract).toContain('schemaVersion: z.literal(1)');
    expect(worker).toContain(
      "import type { FulfillmentDemandChangedEvent } from '@pressly/contracts'",
    );
    expect(worker).not.toMatch(/\bz\.object\s*\(/);
  });

  it('keeps canonical mutations scoped and success-enveloped', () => {
    const routes = [
      'apps/api/src/http/order-management/users/user-command.route.ts',
      'apps/api/src/http/order-management/orders/order-command.route.ts',
      'apps/api/src/http/order-management/orders/order-lifecycle.route.ts',
      'apps/api/src/http/order-management/orders/fulfillment-release.route.ts',
    ]
      .map((filePath) => readFileSync(path.join(repoRoot, filePath), 'utf8'))
      .join('\n');

    expect(routes).toContain("'/order-management/users'");
    expect(routes).toContain(
      "'/order-management/locations/:locationId/orders/:orderId'",
    );
    expect(routes).toContain(
      "'/order-management/locations/:locationId/orders/:orderId/complete'",
    );
    expect(routes).toContain(
      "'/order-management/locations/:locationId/orders/:orderId/cancel'",
    );
    expect(routes).toContain("locationId: request.params['locationId']");
    expect(routes.match(/apiSuccess\(/g)?.length).toBe(8);
  });

  it('keeps submitted candidates outside canonical lifecycle and guards source closure through Production', () => {
    const centsHandler = readFileSync(
      path.join(
        repoRoot,
        'apps/worker/src/jobs/process-webhook-inbox/cents/cents-order.handler.ts',
      ),
      'utf8',
    );
    const workerComposition = readFileSync(
      path.join(
        repoRoot,
        'apps/worker/src/bootstrap/worker-jobs.composition.ts',
      ),
      'utf8',
    );
    const demandPolicyPort = readFileSync(
      path.join(
        repoRoot,
        'modules/business/production/src/apply-fulfillment-demand/apply-fulfillment-demand.port.ts',
      ),
      'utf8',
    );
    const demandRepository = readFileSync(
      path.join(
        repoRoot,
        'modules/business/production/src/apply-fulfillment-demand/apply-fulfillment-demand.repo.ts',
      ),
      'utf8',
    );

    expect(centsHandler).toMatch(
      /orders:\s*Pick<\s*OrdersWorkerApplication,\s*'proposeIncomingOrder'\s*\|\s*'closeIncomingOrderSource'\s*>/,
    );
    expect(centsHandler).toMatch(
      /production:\s*Pick<\s*ProductionApplication,\s*'resolveSourceClosedFulfillment'\s*>/,
    );
    expect(centsHandler).toContain("storedStatus !== 'SUBMITTED'");
    expect(centsHandler).toContain("storedStatus !== 'COMPLETED'");
    expect(centsHandler).toContain("storedStatus !== 'CANCELED'");
    expect(centsHandler).toContain('deps.orders.proposeIncomingOrder');
    expect(centsHandler).toContain('deps.orders.closeIncomingOrderSource');
    expect(centsHandler).toContain(
      'deps.production.resolveSourceClosedFulfillment',
    );
    expect(centsHandler).toContain("proposalKind: 'submitted_order'");
    expect(centsHandler).not.toContain('@pressly/users');
    expect(centsHandler).not.toMatch(/\busers\s*:/);
    expect(centsHandler).not.toContain('observeSource');
    expect(centsHandler).not.toContain('resolvePendingSourceCustomer');
    expect(centsHandler).not.toContain('recordConsent');
    expect(centsHandler).toContain("adapterVersion: 'cents-webhook-v3'");
    expect(centsHandler).not.toMatch(/\borders\s*:\s*OrdersApplication\b/);
    expect(centsHandler).not.toMatch(/\bstate\s*:/);
    expect(centsHandler).not.toMatch(/\breleaseState\s*:/);
    expect(centsHandler).not.toMatch(/\bbagCount\s*:/);
    expect(demandPolicyPort).not.toContain('incomingBagCount');
    expect(demandRepository).not.toMatch(
      /\bbagCount\s*:\s*command\.bagCount\b/,
    );
    expect(workerComposition).toContain(
      'proposeIncomingOrder: orders.proposeIncomingOrder',
    );
    expect(workerComposition).toContain(
      'closeIncomingOrderSource: orders.closeIncomingOrderSource',
    );
    expect(workerComposition).toContain('resolveSourceClosedFulfillment:');
    expect(workerComposition).toContain(
      'production.resolveSourceClosedFulfillment',
    );
    expect(workerComposition).toContain('makePostgresOrdersWorkerApplication');
    expect(workerComposition).not.toContain('makePostgresOrdersApplication');
    expect(workerComposition).not.toContain('@pressly/users');
    expect(workerComposition).not.toContain('orders.observeSource');
    expect(workerComposition).not.toContain('users.resolveSource');
    expect(workerComposition).not.toContain('resolvePendingSourceCustomer');
  });

  it('acknowledges non-order Cents receipts without canonical effects', () => {
    const ignoredHandler = readFileSync(
      path.join(
        repoRoot,
        'apps/worker/src/jobs/process-webhook-inbox/cents/cents-ignored.handler.ts',
      ),
      'utf8',
    );
    const workerComposition = readFileSync(
      path.join(
        repoRoot,
        'apps/worker/src/bootstrap/worker-jobs.composition.ts',
      ),
      'utf8',
    );

    expect(ignoredHandler).toContain(
      "(): WebhookEventConsumer => async () => ({ tag: 'ok' })",
    );
    expect(ignoredHandler).not.toContain('@pressly/users');
    expect(ignoredHandler).not.toContain('@pressly/orders');
    expect(workerComposition).toContain(
      'const acknowledgeIgnoredCentsEvent = makeIgnoredCentsEventHandler();',
    );
    expect(workerComposition).toContain(
      "'cents:customer': acknowledgeIgnoredCentsEvent",
    );
    expect(workerComposition).toContain(
      "'cents:marketing': acknowledgeIgnoredCentsEvent",
    );
    for (const removedHandler of [
      'apps/worker/src/jobs/process-webhook-inbox/cents/cents-customer.handler.ts',
      'apps/worker/src/jobs/process-webhook-inbox/cents/cents-marketing.handler.ts',
    ])
      expect(existsSync(path.join(repoRoot, removedHandler))).toBe(false);
  });

  it('includes every module manifest in cached API and Worker Docker installs', () => {
    for (const dockerfile of [
      'apps/api/Dockerfile',
      'apps/worker/Dockerfile',
    ]) {
      const source = readFileSync(path.join(repoRoot, dockerfile), 'utf8');
      const missing = moduleManifests
        .map((manifestPath) => path.relative(repoRoot, manifestPath))
        .filter(
          (manifestPath) =>
            !source.includes(`COPY ${manifestPath} ${manifestPath}`),
        );

      expect(missing, dockerfile).toEqual([]);
    }
  });

  it('keeps production source neutral to vendors and ingestion mechanics', () => {
    const productionSourceRoot = path.join(
      repoRoot,
      'modules',
      'business',
      'production',
      'src',
    );
    const forbiddenVocabulary =
      /\b(?:cents|webhooks?|receipts?|leases?|crm)\b|crm_/gi;
    const violations = readFiles(productionSourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      const matches = [...source.matchAll(forbiddenVocabulary)].map(
        (match) => match[0],
      );

      return matches.length === 0
        ? []
        : [
            `${path.relative(repoRoot, filePath)} -> ${[
              ...new Set(matches.map((match) => match.toLowerCase())),
            ].join(', ')}`,
          ];
    });

    expect(violations).toEqual([]);
  });

  it('keeps canonical Orders and Users source neutral to vendor adapters', () => {
    const canonicalRoots = [
      path.join(repoRoot, 'modules', 'business', 'orders', 'src'),
      path.join(repoRoot, 'modules', 'business', 'users', 'src'),
    ];
    const forbiddenVendorVocabulary = /\bcents\b/gi;
    const violations = canonicalRoots.flatMap((root) =>
      readFiles(root).flatMap((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        const matches = [...source.matchAll(forbiddenVendorVocabulary)];

        return matches.length === 0 ? [] : [path.relative(repoRoot, filePath)];
      }),
    );

    expect(violations).toEqual([]);
  });

  it('enforces closed policy and computation filename vocabularies', async () => {
    await expectAllowed(
      'modules/policy/production/src/stage/stage.policy.ts',
      'export const transition = true;',
    );
    await expectAllowed(
      'modules/computation/scheduling/src/propose/propose.computation.ts',
      'export const propose = true;',
    );
    await expectRejectedBy(
      'modules/policy/production/src/stage/stage.machine.ts',
      'export const transition = true;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/computation/scheduling/src/propose/propose.service.ts',
      'export const propose = true;',
      'no-restricted-syntax',
    );
  });

  it('rejects runtime imports from the access-control auth port', async () => {
    await expectRejectedBy(
      'modules/policy/access-control/src/auth.port.ts',
      `
        import { Router } from 'express';
        export const leakedRuntime = Router;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects framework imports from intrinsic policy', async () => {
    await expectRejectedBy(
      'modules/business/pricing/src/publish-pricing/publish-pricing.policy.ts',
      `
        import type { Request } from 'express';
        export type PolicyInput = Request;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects persistence mechanisms from the auth HTTP foundation', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/http/auth-context.ts',
      `
        import { auth } from '@pressly/db';
        export const leakedDatabase = auth;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects persistence mechanisms from policy guards', async () => {
    await expectRejectedBy(
      'modules/policy/access-control/src/pricing/pricing.guard.ts',
      `
        import { auth } from '@pressly/db';
        export const leakedDatabase = auth;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects HTTP mechanisms from the auth persistence foundation', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/persistence/database-result.ts',
      `
        import type { Request } from 'express';
        export type LeakedRequest = Request;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects module-local common and shared catch-all folders', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/common/database-result.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });

  it('rejects arbitrary filenames at any depth inside a capability', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/internal/arbitrary.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });

  it('allows descriptive filenames inside explicit business foundations', async () => {
    await expectAllowed(
      'modules/business/auth/src/http/auth-context.ts',
      'export const value = 1;',
    );
    await expectAllowed(
      'modules/business/auth/src/persistence/database-result.ts',
      'export const value = 1;',
    );
  });

  it('rejects schemas and parsers from module source', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.schema.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/business/auth/src/login/login.parser.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/business/auth/src/http/auth-context.schema.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/business/auth/src/persistence/database-result.parser.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/policy/access-control/src/pricing/pricing.schema.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });

  it('rejects tests from module source', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.usecase.test.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });

  it('rejects non-TypeScript module source files', async () => {
    await expectRejectedBy(
      'modules/business/auth/src/login/login.usecase.js',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });
});

describe('web architecture boundaries', () => {
  it('allows app routes to compose product features and concrete runtime adapters', async () => {
    await expectAllowed(
      'apps/web/src/app/(marketing)/pricing/page.tsx',
      `
        import { loadPricing } from '@/features/pricing/server';
        import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';
        export const dependencies = { loadPricing, makeServerWebCore };
      `,
    );
  });

  it('allows feature server composition to select a concrete adapter', async () => {
    await expectAllowed(
      'apps/web/src/features/pricing/server.ts',
      `
        import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';
        export const makeRuntime = makeServerWebCore;
      `,
    );
  });

  it('allows ordinary features to depend on web core through a relative path', async () => {
    await expectAllowed(
      'apps/web/src/features/pricing/model.ts',
      `
        import type { WebCore } from '../../common/core/runtime/core';
        export type PricingRuntime = WebCore;
      `,
    );
  });

  it('allows a route subtree to use its own private code', async () => {
    await expectAllowed(
      'apps/web/src/app/schedule/page.tsx',
      `
        import { ScheduleFrame } from './_components/ScheduleFrame';
        export const Frame = ScheduleFrame;
      `,
    );
  });

  it('rejects product imports from web core', async () => {
    await expectRejectedBy(
      'apps/web/src/common/core/runtime/core.ts',
      `
        import { loadPricing } from '@/features/pricing/queries';
        export const leakedFeature = loadPricing;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects relative product imports from web core', async () => {
    await expectRejectedBy(
      'apps/web/src/common/core/runtime/core.ts',
      `
        import { pricingCatalog } from '../../../features/pricing/model';
        export const leakedFeature = pricingCatalog;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects dynamic relative route imports from web features', async () => {
    await expectRejectedBy(
      'apps/web/src/features/pricing/model.ts',
      `
        export const loadScheduleModel = () => import('../../app/schedule/model');
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects route and product imports from concrete adapters', async () => {
    await expectRejectedBy(
      'apps/web/src/common/adapters/requests/pricing-client.ts',
      `
        import { loadPricing } from '@/features/pricing/queries';
        export const leakedFeature = loadPricing;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects concrete adapter selection from ordinary feature logic', async () => {
    await expectRejectedBy(
      'apps/web/src/features/pricing/queries.ts',
      `
        import { makeFetchRequestClient } from '@/common/adapters/requests/fetch-request-client';
        export const leakedAdapter = makeFetchRequestClient;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects product dependencies from UI primitives', async () => {
    await expectRejectedBy(
      'apps/web/src/components/ui/button.tsx',
      `
        import { loadPricing } from '@/features/pricing/queries';
        export const leakedFeature = loadPricing;
      `,
      'architecture/web-zone-imports',
    );
  });

  it('rejects private route imports from outside the owning subtree', async () => {
    await expectRejectedBy(
      'apps/web/src/app/account/page.tsx',
      `
        import { ScheduleFrame } from '@/app/schedule/_components/ScheduleFrame';
        export const leakedPrivateView = ScheduleFrame;
      `,
      'architecture/web-private-route-imports',
    );
  });

  it('rejects dynamic relative imports of another route subtree private code', async () => {
    await expectRejectedBy(
      'apps/web/src/app/account/page.tsx',
      `
        export const loadScheduleFrame = () => import('../schedule/_components/ScheduleFrame');
      `,
      'architecture/web-private-route-imports',
    );
  });

  it('rejects legacy app-wide shared buckets', async () => {
    await expectRejectedBy(
      'apps/web/src/app/shared/marketing/pricing.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });
});

describe('processor architecture boundaries', () => {
  it('allows app composition to select adapters and compose features', async () => {
    await expectAllowed(
      'apps/processor/src/app/app.composition.ts',
      `
        import { makeApiProductionAdapter } from '@/adapters/production/api-production.adapter';
        import { SchedulingWorkspace } from '@/features/scheduling/scheduling.view';
        export const dependencies = { makeApiProductionAdapter, SchedulingWorkspace };
      `,
    );
  });

  it('allows centralized localization setup and catalogs under src/i18n', async () => {
    await expectAllowed(
      'apps/processor/src/i18n/index.ts',
      `
        import i18next from 'i18next';
        import scheduling from './locales/en/scheduling.json';
        export const dependencies = { i18next, scheduling };
      `,
    );
  });

  it('allows feature models to depend on framework-free ports', async () => {
    await expectAllowed(
      'apps/processor/src/features/scheduling/scheduling.model.ts',
      `
        import type { ProductionPort } from '@/ports/production.port';
        export type SchedulingDependencies = { production: ProductionPort };
      `,
    );
  });

  it('allows a feature view to use its own model and UI primitives', async () => {
    await expectAllowed(
      'apps/processor/src/features/scheduling/scheduling.view.tsx',
      `
        import { useSchedulingModel } from './scheduling.model';
        import { Button } from '@/components/ui/button';
        export const dependencies = { useSchedulingModel, Button };
      `,
    );
  });

  it('rejects feature-local message catalogs', async () => {
    await expectRejectedBy(
      'apps/processor/src/features/scheduling/scheduling.messages.ts',
      `
        export const englishSchedulingMessages = { scheduling: { title: 'Schedule' } } as const;
      `,
      'no-restricted-syntax',
    );
  });

  it('keeps shadcn styling mechanics inside the UI boundary', async () => {
    await expectAllowed(
      'apps/processor/src/components/ui/button.tsx',
      `
        import { cn } from '@/components/ui/class-names';
        export const classes = cn('rounded');
      `,
    );
  });

  it('rejects outward dependencies from processor ports', async () => {
    await expectRejectedBy(
      'apps/processor/src/ports/production.port.ts',
      `
        import { makeApiProductionAdapter } from '@/adapters/production/api-production.adapter';
        export const leakedAdapter = makeApiProductionAdapter;
      `,
      'architecture/processor-zone-imports',
    );
  });

  it('rejects product feature dependencies from adapters', async () => {
    await expectRejectedBy(
      'apps/processor/src/adapters/production/api-production.adapter.ts',
      `
        import { useSchedulingModel } from '@/features/scheduling/scheduling.model';
        export const leakedFeature = useSchedulingModel;
      `,
      'architecture/processor-zone-imports',
    );
  });

  it('rejects concrete adapter selection from processor features', async () => {
    await expectRejectedBy(
      'apps/processor/src/features/scheduling/scheduling.model.ts',
      `
        import { makeApiProductionAdapter } from '@/adapters/production/api-production.adapter';
        export const leakedAdapter = makeApiProductionAdapter;
      `,
      'architecture/processor-zone-imports',
    );
  });

  it('rejects imports between peer processor features', async () => {
    await expectRejectedBy(
      'apps/processor/src/features/scheduling/scheduling.view.tsx',
      `
        import { ProductionBoardWorkspace } from '../production-board/production-board.view';
        export const leakedPeer = ProductionBoardWorkspace;
      `,
      'architecture/processor-zone-imports',
    );
  });

  it('rejects application and product dependencies from UI primitives', async () => {
    await expectRejectedBy(
      'apps/processor/src/components/ui/button.tsx',
      `
        import { SchedulingWorkspace } from '@/features/scheduling/scheduling.view';
        export const leakedFeature = SchedulingWorkspace;
      `,
      'architecture/processor-zone-imports',
    );
  });

  it('keeps localization frameworks out of shadcn UI primitives', async () => {
    await expectRejectedBy(
      'apps/processor/src/components/ui/button.tsx',
      `
        import { useTranslation } from 'react-i18next';
        export const leakedLocalization = useTranslation;
      `,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('keeps the Vite entrypoint limited to app bootstrap', async () => {
    await expectRejectedBy(
      'apps/processor/src/main.tsx',
      `
        import { SchedulingWorkspace } from '@/features/scheduling/scheduling.view';
        export const leakedFeature = SchedulingWorkspace;
      `,
      'architecture/processor-zone-imports',
    );
  });

  it('rejects unowned processor catch-all folders and unnamed feature roles', async () => {
    await expectRejectedBy(
      'apps/processor/src/shared/production.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'apps/processor/src/lib/utils.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'apps/processor/src/localization/resources.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'apps/processor/src/features/scheduling/helpers.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'apps/processor/src/adapters/production/helpers.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'apps/processor/src/adapters/production/demo.fixture.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'apps/processor/src/ports/helpers.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
  });

  it('separates Order Control read composition, presentation, orchestration, and view', () => {
    const readModel = readFileSync(
      path.join(
        repoRoot,
        'apps/api/src/http/processor/order-control/order-control.query.ts',
      ),
      'utf8',
    );
    const presenter = readFileSync(
      path.join(
        repoRoot,
        'apps/processor/src/features/order-control/order-control.presenter.ts',
      ),
      'utf8',
    );
    const workspaceView = readFileSync(
      path.join(
        repoRoot,
        'apps/processor/src/features/order-control/order-control-workspace.view.tsx',
      ),
      'utf8',
    );

    expect(readModel).not.toContain('sourceLifecycleCode');
    expect(readModel).not.toContain('projectSourceComparison');
    expect(readModel).not.toMatch(/\bcomparison\s*:/);
    expect(readModel).not.toContain('normalizedPayload');
    expect(readModel).not.toContain('Reflect.get');
    expect(presenter).not.toMatch(/from ["']react["']/);
    expect(workspaceView).toContain('useOrderControlWorkspaceModel');
    expect(workspaceView).not.toMatch(
      /\b(?:useState|useEffect|useMemo|useCallback|useRef)\b/,
    );
    expect(workspaceView.split('\n').length).toBeLessThan(40);
  });
});

describe('API and Worker runtime boundaries', () => {
  it('removes the legacy catch-all application directories', () => {
    for (const legacyRoot of [
      'apps/api/src/common',
      'apps/api/src/routes',
      'apps/api/src/read-models',
      'apps/api/src/vendors',
      'apps/api/src/commands',
      'apps/worker/src/common',
      'apps/worker/src/lpms',
      'apps/worker/src/order-outbox',
      'apps/worker/src/vendors',
    ]) {
      const legacyPath = path.join(repoRoot, legacyRoot);
      expect(
        existsSync(legacyPath) ? readFiles(legacyPath) : [],
        legacyRoot,
      ).toEqual([]);
    }

    expect(
      existsSync(
        path.join(
          repoRoot,
          'apps/cli/src/commands/bootstrap-production.command.ts',
        ),
      ),
    ).toBe(true);
  });

  it('keeps application entrypoints limited to bootstrap and runtime setup', () => {
    const allowed = {
      api: (specifier) =>
        specifier.startsWith('./bootstrap/') ||
        specifier.startsWith('./runtime/'),
      worker: (specifier) =>
        specifier === '@pressly/logging' ||
        specifier.startsWith('./bootstrap/') ||
        specifier.startsWith('./runtime/'),
    };

    for (const [application, accepts] of Object.entries(allowed)) {
      const filePath = path.join(
        repoRoot,
        'apps',
        application,
        'src',
        'main.ts',
      );
      const imports = importSpecifiers(readFileSync(filePath, 'utf8'));
      expect(imports.filter((specifier) => !accepts(specifier))).toEqual([]);
    }
  });

  it('keeps runtime mechanics independent from HTTP, jobs, and business modules', () => {
    const violations = ['api', 'worker'].flatMap((application) => {
      const runtimeRoot = path.join(
        repoRoot,
        'apps',
        application,
        'src',
        'runtime',
      );

      return readFiles(runtimeRoot).flatMap((filePath) =>
        importSpecifiers(readFileSync(filePath, 'utf8')).flatMap(
          (specifier) => {
            const relativeTarget = specifier.startsWith('.')
              ? relativeImportTarget(filePath, specifier)
              : null;
            const crossesApplicationZone =
              relativeTarget !== null &&
              ['/http/', '/jobs/', '/bootstrap/'].some((segment) =>
                relativeTarget.includes(segment),
              );
            const importsBusinessModule = modulePackageNames.has(specifier);

            return crossesApplicationZone || importsBusinessModule
              ? [`${path.relative(repoRoot, filePath)} -> ${specifier}`]
              : [];
          },
        ),
      );
    });

    expect(violations).toEqual([]);
  });

  it('keeps API HTTP capabilities and Worker jobs peer-independent', () => {
    const apiHttpRoot = path.join(repoRoot, 'apps/api/src/http');
    const apiViolations = readFiles(apiHttpRoot).flatMap((filePath) => {
      const sourceRelative = path.relative(apiHttpRoot, filePath);
      const sourceCapability = sourceRelative.split(path.sep)[0];

      return importSpecifiers(readFileSync(filePath, 'utf8')).flatMap(
        (specifier) => {
          if (!specifier.startsWith('.')) return [];
          const target = relativeImportTarget(filePath, specifier);
          const targetRelative = path.relative(apiHttpRoot, target);
          if (targetRelative.startsWith(`..${path.sep}`)) return [];
          const targetCapability = targetRelative.split(path.sep)[0];
          return targetCapability !== sourceCapability
            ? [`${sourceRelative} -> ${specifier}`]
            : [];
        },
      );
    });

    const workerJobsRoot = path.join(repoRoot, 'apps/worker/src/jobs');
    const workerViolations = readFiles(workerJobsRoot).flatMap((filePath) => {
      const sourceRelative = path.relative(workerJobsRoot, filePath);
      const sourceJob = sourceRelative.split(path.sep)[0];

      return importSpecifiers(readFileSync(filePath, 'utf8')).flatMap(
        (specifier) => {
          if (!specifier.startsWith('.')) return [];
          const target = relativeImportTarget(filePath, specifier);
          const targetRelative = path.relative(workerJobsRoot, target);
          if (targetRelative.startsWith(`..${path.sep}`)) return [];
          const targetJob = targetRelative.split(path.sep)[0];
          return targetJob !== sourceJob
            ? [`${sourceRelative} -> ${specifier}`]
            : [];
        },
      );
    });

    expect(apiViolations).toEqual([]);
    expect(workerViolations).toEqual([]);
  });
});
