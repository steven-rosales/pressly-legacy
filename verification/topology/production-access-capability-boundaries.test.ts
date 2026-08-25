import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const sourceFiles = (directory: string): readonly string[] =>
  readdirSync(path.join(repositoryRoot, directory), {
    recursive: true,
    withFileTypes: true,
  }).flatMap((entry) => {
    if (!entry.isFile() || !/[.]ts$/u.test(entry.name)) return [];
    const absolute = path.join(entry.parentPath, entry.name);
    if (/[.](?:spec|test)[.]ts$/u.test(absolute)) return [];
    return [path.relative(repositoryRoot, absolute).replaceAll(path.sep, '/')];
  });

describe('Production and Access capability boundaries', () => {
  it('keeps every public collaboration contract data-only and owner-executed', () => {
    const contracts = [
      'systems/access/src/contracts/production-actor-read-v1.ts',
      'systems/access/src/contracts/production-scope-reconciliation-v1.ts',
    ];

    for (const contract of contracts) {
      const source = read(contract);
      expect(source, contract).toContain("transaction: 'owner-owned'");
      expect(source, contract).not.toMatch(
        /@pressly\/postgres|drizzle-orm|Postgres(?:Database|Executor|Transaction)|AccessSchema|ProductionSchema|\bsql\b|caller-owned/u,
      );
      expect(source, contract).not.toMatch(
        /(?:planForTransaction|loadInTransaction|listInTransaction|readInTransaction)/u,
      );
    }

    expect(
      existsSync(
        path.join(
          repositoryRoot,
          'systems/production/src/contracts/production-location-live-revision-v1.ts',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          repositoryRoot,
          'topology/runtime/http/production/location-live-revision.ts',
        ),
      ),
    ).toBe(false);
  });

  it('keeps Production resource reconciliation owner-local', () => {
    const consumers = sourceFiles('systems/production/src')
      .filter((file) => !file.includes('/testing/'))
      .filter((file) =>
        read(file).includes('productionScopeAtomicReconciliation'),
      )
      .sort();

    expect(consumers).toEqual([]);

    const bridge = read(
      'systems/access/src/assembly/production-capabilities.postgres.ts',
    );
    expect(bridge).not.toContain('PostgresTransaction');
    expect(bridge).not.toContain('reconcileInTransaction');

    const resources = read(
      'systems/production/src/cells/resources/manage-resources/postgres.ts',
    );
    expect(resources).toContain('schema.productionLocations');
    expect(resources).not.toContain('@pressly/access-system');
  });

  it('keeps Production history free of Access SQL composition', () => {
    for (const file of [
      'systems/production/src/cells/history/list-activity/postgres.ts',
      'systems/production/src/cells/history/load-run/postgres.ts',
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /planForTransaction|actorRead[.]relation|actorRead[.]join|matchesSearch/u,
      );
      expect(source, file).toContain('loadActors');
    }
  });

  it('places the live revision only in Production schema source', () => {
    const access = read('systems/access/src/schema/scope.ts');
    const production = read(
      'systems/production/src/schema/production-schema.ts',
    );
    const feed = read(
      'systems/production/src/cells/live/subscribe-changes/postgres.ts',
    );

    expect(access).not.toContain('liveRevision');
    expect(production).toContain('liveRevision');
    expect(feed).toContain('input.schema.productionLocations.liveRevision');
    expect(feed).not.toContain('@pressly/access-system');
  });
});
