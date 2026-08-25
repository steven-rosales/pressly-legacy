import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { duplicateOwnedPackageExportTargets } from '../scripts/package-export-targets.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const dependencyCruiser = path.join(
  repositoryRoot,
  'node_modules',
  '.bin',
  'depcruise',
);
const configuration = path.join(
  repositoryRoot,
  'dependency-cruiser.config.mjs',
);
const fixtureRoots = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const fixture = (files) => {
  const root = mkdtempSync(
    path.join(tmpdir(), 'pressly-cellular-architecture-'),
  );
  fixtureRoots.push(root);
  for (const [relativePath, source] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source, 'utf8');
  }
  return root;
};

const cruise = (root, entries) =>
  spawnSync(
    dependencyCruiser,
    ['--config', configuration, '--output-type', 'err', ...entries],
    {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    },
  );

const expectViolation = (files, entries, rule) => {
  const root = fixture(files);
  const result = cruise(root, entries);
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain(rule);
};

describe('cellular dependency enforcement', () => {
  it('checks Dependency Cruiser source-map freshness before architecture lint', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
    );
    const architectureLint = manifest.scripts['lint:architecture'];
    const cellularLint = manifest.scripts['lint:architecture:cellular'];

    expect(architectureLint).toBe('pnpm lint:architecture:cellular');
    expect(cellularLint).toContain(
      'node tooling/scripts/generate-dependency-cruiser-tsconfig.mjs --check',
    );
    expect(cellularLint.indexOf('--check')).toBeLessThan(
      cellularLint.indexOf('eslint hosts'),
    );
  });

  it('uses Dependency Cruiser source mapping for workspace package edges', () => {
    const result = spawnSync(
      dependencyCruiser,
      [
        '--config',
        configuration,
        '--output-type',
        'json',
        '--do-not-follow',
        '^systems/access/src/contracts/experience-access-v1[.]ts$',
        'experiences/control/src/auth/model/access.ts',
      ],
      { cwd: repositoryRoot, encoding: 'utf8', env: process.env },
    );

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    const importer = report.modules.find(
      (module) =>
        module.source === 'experiences/control/src/auth/model/access.ts',
    );
    const dependency = importer?.dependencies.find(
      (candidate) =>
        candidate.module ===
        '@pressly/access-system/capabilities/experience-access-v1',
    );

    expect(dependency).toMatchObject({
      resolved: 'systems/access/src/contracts/experience-access-v1.ts',
      couldNotResolve: false,
    });
    expect(dependency?.dependencyTypes).toContain('aliased-tsconfig-paths');
    expect(dependency?.resolved).not.toContain('/dist/');
    expect(report.summary.optionsUsed.tsConfig.fileName).toBe(
      path.join(
        repositoryRoot,
        'tooling/typescript/dependency-cruiser.generated.json',
      ),
    );
  });

  it('publishes only explicit generated browser client subpaths', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'generated/package.json'), 'utf8'),
    );
    const clientExports = Object.keys(manifest.exports)
      .filter((specifier) => specifier.startsWith('./clients/'))
      .sort();

    expect(clientExports).toEqual([
      './clients/control',
      './clients/customer',
      './clients/processor',
    ]);
    expect(clientExports.some((specifier) => specifier.includes('*'))).toBe(
      false,
    );
  });

  it('rejects duplicate public package keys resolving to one owned target tuple', () => {
    const duplicateTarget = {
      types: './dist/cells/bindings/reconcile/model.d.ts',
      import: './dist/cells/bindings/reconcile/model.js',
      default: './dist/cells/bindings/reconcile/model.js',
    };
    expect(
      duplicateOwnedPackageExportTargets({
        exports: {
          './capabilities/source-location-bindings-v1': duplicateTarget,
          './operations/bindings/reconcile/model': {
            default: duplicateTarget.default,
            import: duplicateTarget.import,
            types: duplicateTarget.types,
          },
        },
      }),
    ).toEqual([
      {
        specifiers: [
          './capabilities/source-location-bindings-v1',
          './operations/bindings/reconcile/model',
        ],
        targetTuple: JSON.stringify([
          ['default', duplicateTarget.default],
          ['import', duplicateTarget.import],
          ['types', duplicateTarget.types],
        ]),
      },
    ]);

    expect(
      duplicateOwnedPackageExportTargets({
        exports: {
          './browser': {
            types: './dist/browser.d.ts',
            import: './dist/browser.js',
          },
          './server': {
            types: './dist/server.d.ts',
            import: './dist/server.js',
          },
        },
      }),
    ).toEqual([]);
  });

  it('rejects a host importing a business system', () => {
    expectViolation(
      {
        'hosts/http/main.ts': "import '../../systems/orders/private.ts';\n",
        'systems/orders/private.ts': 'export const privateOrder = true;\n',
      },
      ['hosts', 'systems'],
      'hosts-are-domain-free',
    );
  });

  it('rejects a platform mechanism importing business knowledge', () => {
    expectViolation(
      {
        'platform/logging/logger.ts':
          "import '../../systems/production/private.ts';\n",
        'systems/production/private.ts':
          'export const productionMeaning = true;\n',
      },
      ['platform', 'systems'],
      'platform-has-no-business-knowledge',
    );
  });

  it('rejects one system importing peer-system internals', () => {
    expectViolation(
      {
        'systems/production/cells/project.ts':
          "import '../../orders/model/order.ts';\n",
        'systems/orders/model/order.ts': 'export const order = true;\n',
      },
      ['systems'],
      'no-production-to-peer-internals',
    );
  });

  it('rejects one host importing a business system', () => {
    expectViolation(
      {
        'hosts/http/src/main.ts':
          "import '../../../systems/orders/src/private.ts';\n",
        'systems/orders/src/private.ts': 'export const orderPrivate = true;\n',
      },
      ['hosts', 'systems'],
      'hosts-are-domain-free',
    );
  });

  it('rejects an Experience importing a system private surface', () => {
    expectViolation(
      {
        'experiences/control/src/client.ts':
          "import '../../../systems/access/src/model/private.ts';\n",
        'systems/access/src/model/private.ts':
          'export const accessPrivate = true;\n',
      },
      ['experiences', 'systems'],
      'experiences-use-system-public-surfaces',
    );
  });

  it('rejects a Platform mechanism importing business knowledge', () => {
    expectViolation(
      {
        'platform/http/src/request.ts':
          "import '../../../systems/orders/src/public.ts';\n",
        'systems/orders/src/public.ts': 'export const orders = true;\n',
      },
      ['platform', 'systems'],
      'platform-has-no-business-knowledge',
    );
  });

  it('rejects a PostgreSQL mechanism importing the composed topology schema', () => {
    expectViolation(
      {
        'platform/postgres/src/migration-runner.ts':
          "import '../../../topology/pressly-postgres-schema.ts';\nexport const migrate = true;\n",
        'topology/pressly-postgres-schema.ts':
          'export const presslyPostgresSchema = {};\n',
      },
      ['platform', 'topology'],
      'platform-has-no-business-knowledge',
    );
  });

  it('rejects production source importing verification code', () => {
    expectViolation(
      {
        'systems/orders/src/main.ts':
          "import '../../../verification/orders/test/fault.ts';\n",
        'verification/orders/test/fault.ts': 'export const testFault = true;\n',
      },
      ['systems', 'verification'],
      'production-code-does-not-depend-on-verification',
    );
  });

  it('rejects verification and peer owners importing aggregate owner roots', () => {
    expectViolation(
      {
        'verification/orders/test/inventory.ts':
          "import '../../../systems/orders/src/public.ts';\n",
        'systems/orders/src/public.ts': 'export const orders = true;\n',
      },
      ['verification', 'systems'],
      'verification-does-not-import-aggregate-owner-roots',
    );
    expectViolation(
      {
        'systems/production/src/read.ts':
          "import '../../orders/src/public.ts';\n",
        'systems/orders/src/public.ts': 'export const orders = true;\n',
      },
      ['systems'],
      'no-production-to-peer-aggregate-owner-roots',
    );
  });

  it('rejects Node effects in a pure cell decision', () => {
    expectViolation(
      {
        'systems/production/cells/floor/advance-stage/decide.ts':
          "import { readFileSync } from 'node:fs';\nexport const decide = () => readFileSync('/tmp/value');\n",
      },
      ['systems'],
      'pure-decisions-have-no-node-effects',
    );
  });

  it('rejects mechanism effects in a pure cell decision', () => {
    expectViolation(
      {
        'systems/production/src/cells/floor/advance-stage/decide.ts':
          "import '../../../../../../platform/postgres/src/query.ts';\nexport const decide = () => true;\n",
        'platform/postgres/src/query.ts': 'export const sql = true;\n',
      },
      ['systems', 'platform'],
      'pure-decisions-have-no-mechanism-effects',
    );
  });

  it('allows a generated catalog to import a public system assembly', () => {
    const root = fixture({
      'generated/http-catalog.ts':
        "import { assemble } from '../systems/production/public/assembly.ts';\nexport const catalog = assemble;\n",
      'systems/production/public/assembly.ts':
        'export const assemble = () => ({ cells: {} });\n',
    });
    const result = cruise(root, ['generated', 'systems']);

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'no dependency violations found',
    );
  });

  it('allows one normal query feature through its cell, owner surface, topology, and generated catalog', () => {
    const root = fixture({
      'systems/orders/src/cells/queries/load-order/cell.ts':
        'export const loadOrder = () => ({ id: "order-1" });\n',
      'systems/orders/src/cells/queries/load-order/cell.spec.ts':
        "import { loadOrder } from './cell.ts';\nexport const result = loadOrder();\n",
      'systems/orders/src/public.ts':
        "import { loadOrder } from './cells/queries/load-order/cell.ts';\nexport const makeOrdersSystem = () => ({ cells: { loadOrder } });\n",
      'topology/pressly.topology.ts':
        "import { makeOrdersSystem } from '../systems/orders/src/public.ts';\nexport const topology = makeOrdersSystem();\n",
      'generated/http-catalog.ts':
        "import { makeOrdersSystem } from '../systems/orders/src/public.ts';\nexport const catalog = makeOrdersSystem().cells;\n",
    });
    const result = cruise(root, ['systems', 'topology', 'generated']);

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'no dependency violations found',
    );
  });
});
