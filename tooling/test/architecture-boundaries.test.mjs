import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { presslyModuleArchitecture } from '../architecture/pressly-module-architecture.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

const moduleRoot = path.join(repoRoot, 'modules');

const moduleManifests = readdirSync(moduleRoot, {
  withFileTypes: true,
}).flatMap((group) => {
  if (!group.isDirectory()) return [];

  const groupRoot = path.join(moduleRoot, group.name);

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

const moduleSourceRoots = moduleManifests
  .map((manifestPath) => path.join(path.dirname(manifestPath), 'src'))
  .filter(existsSync);

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

const applicationAndPackageSourceRoots = ['apps', 'packages'].flatMap(
  (group) => {
    const groupRoot = path.join(repoRoot, group);
    return readdirSync(groupRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(groupRoot, entry.name, 'src'))
      .filter(existsSync);
  },
);

const runtimeSourceFiles = [
  ...applicationAndPackageSourceRoots,
  ...moduleSourceRoots,
]
  .flatMap(readFiles)
  .filter((filePath) => /\.tsx?$/.test(filePath));

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
  it('keeps every module manifest and sealed source root in the compiled graph', () => {
    const actualModuleKeys = moduleManifests.map((manifestPath) => {
      const moduleName = path.basename(path.dirname(manifestPath));
      const familyName = path.basename(
        path.dirname(path.dirname(manifestPath)),
      );

      return `${familyName}/${moduleName}`;
    });

    expect(presslyModuleArchitecture.moduleKeyDelta(actualModuleKeys)).toEqual({
      missing: [],
      unexpected: [],
    });

    for (const sourceRoot of moduleSourceRoots) {
      const rootFiles = readdirSync(sourceRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();

      expect(rootFiles).toEqual(['main.ts', 'public.ts']);
    }
  });

  it('keeps modules as package-independent peers', () => {
    const violations = moduleManifests.flatMap((manifestPath) => {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const dependencies = Object.entries({
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
        ...(manifest.optionalDependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
      });

      return dependencies
        .filter(([dependency]) => modulePackageNames.has(dependency))
        .map(
          ([dependency]) =>
            `${path.relative(repoRoot, manifestPath)} -> ${dependency}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('rejects direct imports between peer module packages', async () => {
    await expectRejectedBy(
      'modules/business/users/src/features/users/read-users/read-users.usecase.ts',
      `import type { OrdersApplication } from '@pressly/orders'; export type Leak = OrdersApplication;`,
      'architecture/module-isolation',
    );
    await expectRejectedBy(
      'modules/business/orders/src/features/orders/read-order/read-order.usecase.ts',
      `import type { UsersApplication } from '@pressly/users'; export type Leak = UsersApplication;`,
      'architecture/module-isolation',
    );
  });

  it('keeps Users and Orders persistence feature-owned', () => {
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
      existsSync(path.join(repoRoot, 'modules/business/users/src/persistence')),
    ).toBe(false);
    expect(
      existsSync(
        path.join(repoRoot, 'modules/business/orders/src/persistence'),
      ),
    ).toBe(false);
  });

  it('keeps the versioned fulfillment-demand event at the Orders contract edge', () => {
    const contract = readFileSync(
      path.join(
        repoRoot,
        'packages/contracts/src/orders/fulfillment-demand-event.contracts.ts',
      ),
      'utf8',
    );
    const mapper = readFileSync(
      path.join(
        repoRoot,
        'modules/business/orders/src/foundations/adapters/outbox/fulfillment-demand-codec/fulfillment-demand.contract.mapper.ts',
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
    expect(mapper).toContain("from '@pressly/contracts/orders'");
    expect(worker).not.toMatch(/from ['"]@pressly\/contracts(?:\/|['"])/);
    expect(worker).not.toMatch(/\bz\.object\s*\(/);
  });

  it('keeps canonical mutations scoped and success-enveloped', () => {
    const routes = [
      'apps/api/src/http/control/data/control-customer.route.ts',
      'apps/api/src/http/order-management/orders/order-command.route.ts',
      'apps/api/src/http/order-management/orders/order-lifecycle.route.ts',
      'apps/api/src/http/order-management/orders/fulfillment-release.route.ts',
    ]
      .map((filePath) => readFileSync(path.join(repoRoot, filePath), 'utf8'))
      .join('\n');

    expect(routes).toContain("'/customers'");
    expect(routes).toContain("'/customers/:userId'");
    expect(routes).toContain(
      "'/order-management/locations/:locationId/orders/:orderId'",
    );
    expect(routes).toContain(
      "'/order-management/locations/:locationId/orders/:orderId/complete'",
    );
    expect(routes).toContain(
      "'/order-management/locations/:locationId/orders/:orderId/cancel'",
    );
    expect(routes.match(/apiSuccess\(/g)?.length).toBe(10);
  });

  it('keeps ordinary HTTP error presentation at the API boundary', () => {
    const apiHttpRoot = path.join(repoRoot, 'apps', 'api', 'src', 'http');
    const allowedPresenters = new Set([
      'apps/api/src/http/middleware/error.middleware.ts',
      'apps/api/src/http/system/health/health.route.ts',
    ]);
    const candidates = [
      ...readFiles(apiHttpRoot),
      ...moduleSourceRoots.flatMap(readFiles),
    ].filter((filePath) => filePath.endsWith('.ts'));

    const violations = candidates.flatMap((filePath) => {
      const relativePath = path.relative(repoRoot, filePath);
      if (allowedPresenters.has(relativePath)) return [];
      return /\bapiFailure\s*\(/.test(readFileSync(filePath, 'utf8'))
        ? [relativePath]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('keeps runtime failures inside the shared error contract', () => {
    const nativeThrowViolations = runtimeSourceFiles.flatMap((filePath) => {
      const relativePath = path.relative(repoRoot, filePath);
      if (/^apps\/(?:processor|web)\/src\/components\/ui\//.test(relativePath))
        return [];
      return /\bthrow\s+new\s+(?:AggregateError|DOMException|Error|EvalError|RangeError|ReferenceError|SyntaxError|TypeError|URIError)\s*\(/.test(
        readFileSync(filePath, 'utf8'),
      )
        ? [relativePath]
        : [];
    });
    const structuralConstructors = new Set([
      'apps/api/src/http/middleware/error.middleware.ts',
      'apps/processor/src/ports/request.error.ts',
      'apps/worker/src/runtime/observability/worker-observability.ts',
      'packages/errors/src/app-error.ts',
      'packages/errors/src/factories.ts',
    ]);
    const structuralConstructorViolations = runtimeSourceFiles.flatMap(
      (filePath) => {
        const relativePath = path.relative(repoRoot, filePath);
        if (structuralConstructors.has(relativePath)) return [];
        return /\bmakeAppError\s*\(/.test(readFileSync(filePath, 'utf8'))
          ? [relativePath]
          : [];
      },
    );

    expect(nativeThrowViolations).toEqual([]);
    expect(structuralConstructorViolations).toEqual([]);
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
    const demandPort = readFileSync(
      path.join(
        repoRoot,
        'modules/business/production/src/features/demand/apply-fulfillment-demand/apply-fulfillment-demand.port.ts',
      ),
      'utf8',
    );
    const demandRepository = readFileSync(
      path.join(
        repoRoot,
        'modules/business/production/src/features/demand/apply-fulfillment-demand/apply-fulfillment-demand.repo.ts',
      ),
      'utf8',
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
    expect(centsHandler).toContain("adapterVersion: 'cents-webhook-v3'");
    expect(centsHandler).not.toContain('@pressly/users');
    expect(centsHandler).not.toContain('resolvePendingSourceCustomer');
    expect(demandPort).not.toContain('incomingBagCount');
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
    expect(workerComposition).not.toContain('@pressly/users');
  });

  it('includes every module manifest in cached API and Worker installs', () => {
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

  it('keeps canonical modules neutral to vendor and ingestion mechanics', () => {
    const productionRoot = path.join(
      repoRoot,
      'modules/business/production/src',
    );
    const canonicalRoots = [
      path.join(repoRoot, 'modules/business/orders/src'),
      path.join(repoRoot, 'modules/business/users/src'),
    ];
    const productionViolations = readFiles(productionRoot).flatMap(
      (filePath) => {
        const matches = [
          ...readFileSync(filePath, 'utf8').matchAll(
            /\b(?:cents|webhooks?|receipts?|leases?|crm)\b|crm_/gi,
          ),
        ];
        return matches.length === 0 ? [] : [path.relative(repoRoot, filePath)];
      },
    );
    const canonicalViolations = canonicalRoots.flatMap((root) =>
      readFiles(root).flatMap((filePath) => {
        const matches = [
          ...readFileSync(filePath, 'utf8').matchAll(/\bcents\b/gi),
        ];
        return matches.length === 0 ? [] : [path.relative(repoRoot, filePath)];
      }),
    );

    expect(productionViolations).toEqual([]);
    expect(canonicalViolations).toEqual([]);
  });

  it('rejects framework and persistence dependencies from pure v2 owners', async () => {
    await expectRejectedBy(
      'modules/security/authorization/src/features/commercial/authorize-pricing/pricing-authorization.policy.ts',
      `import { Router } from 'express'; export const leakedRuntime = Router;`,
      'architecture/module-v2-dependencies',
    );
    await expectRejectedBy(
      'modules/security/identity/src/foundations/adapters/http/authentication-request/auth-context.adapter.ts',
      `import { authSessions } from '@pressly/db/schema/auth'; export const leakedDatabase = authSessions;`,
      '@typescript-eslint/no-restricted-imports',
    );
    await expectRejectedBy(
      'modules/security/identity/src/foundations/adapters/postgres/identity-store/database-result.adapter.ts',
      `import type { Request } from 'express'; export type LeakedRequest = Request;`,
      '@typescript-eslint/no-restricted-imports',
    );
  });

  it('rejects aggregate package roots through every module syntax', async () => {
    const fixturePath = 'apps/api/src/bootstrap/package-boundary.fixture.ts';

    for (const source of [
      `import '@pressly/contracts';`,
      `export { createDatabaseRuntime } from '@pressly/db';`,
      `export * from '@pressly/errors';`,
      `export const loadContracts = () => import('@pressly/contracts');`,
    ])
      await expectRejectedBy(
        fixturePath,
        source,
        'architecture/explicit-package-boundaries',
      );

    await expectAllowed(
      fixturePath,
      `
        import { loginRequestSchema } from '@pressly/contracts/auth';
        import { createDatabaseRuntime } from '@pressly/db/client';
        import { makeAppError } from '@pressly/errors/app-error';
        export const explicitBoundaryDependencies = {
          loginRequestSchema,
          createDatabaseRuntime,
          makeAppError,
        };
      `,
    );
  });

  it('rejects catch-all folders and unowned source vocabulary', async () => {
    await expectRejectedBy(
      'modules/security/identity/src/common/database-result.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/security/authorization/src/features/commercial/authorize-pricing/pricing.schema.ts',
      'export const value = 1;',
      'architecture/module-v2-file-role',
    );
    await expectRejectedBy(
      'modules/security/identity/src/features/sessions/login/login.usecase.test.ts',
      'export const value = 1;',
      'no-restricted-syntax',
    );
    await expectRejectedBy(
      'modules/security/identity/src/features/sessions/login/login.usecase.js',
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
        export const pricingRuntimeAdapters = { makeServerWebCore };
      `,
    );
  });

  it('allows ordinary features to depend on web core through a relative path', async () => {
    await expectAllowed(
      'apps/web/src/features/pricing/model.ts',
      `
        import type { WebCore } from '../../common/core/runtime/core';
        export type PricingRuntime = Readonly<{ core: WebCore }>;
      `,
    );
  });

  it('allows a route subtree to use its own private code', async () => {
    await expectAllowed(
      'apps/web/src/app/schedule/page.tsx',
      `
        import { ScheduleFrame } from './_components/ScheduleFrame';
        export const scheduleComponents = { ScheduleFrame };
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
        'apps/api/src/http/processor/order-control/order-control.contract.mapper.ts',
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

  it('keeps API HTTP features and Worker jobs peer-independent', () => {
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
          if (!targetRelative.includes(path.sep)) return [];
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
