import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(import.meta.dirname, '../..');
const compose = parse(
  readFileSync(resolve(root, 'docker-compose.yml'), 'utf8'),
);
const manifest = JSON.parse(
  readFileSync(
    resolve(root, 'tooling/fixtures/pressly-one.production-bootstrap.json'),
    'utf8',
  ),
);
const cliPackage = JSON.parse(
  readFileSync(resolve(root, 'apps/cli/package.json'), 'utf8'),
);

describe('local development topology', () => {
  it('bootstraps Pressly One before starting the API', () => {
    const command = compose.services.api.command;
    const bootstrap = command.indexOf('bootstrap:production');
    const api = command.lastIndexOf('@pressly/api dev');

    expect(bootstrap).toBeGreaterThan(-1);
    expect(command).toContain('@pressly/cli bootstrap:production');
    expect(api).toBeGreaterThan(bootstrap);
    expect(command).toContain(
      '/repo/tooling/fixtures/pressly-one.production-bootstrap.json',
    );
    expect(command).toContain(
      'local-pressly-one-topology-$$(sha256sum /repo/tooling/fixtures/pressly-one.production-bootstrap.json | cut -c1-16)',
    );
    expect(command).toContain('--apply');
    expect(cliPackage.scripts['build:workspace-deps']).toContain(
      'exec turbo build',
    );
  });

  it('keeps the local fixture topology-only and outside production Compose', () => {
    expect(manifest.location).toMatchObject({
      id: 'pressly-one',
      name: 'Pressly One',
      isActive: true,
    });
    expect(manifest).not.toHaveProperty('orders');
    expect(manifest.sourceLocationBindings).toEqual([
      expect.objectContaining({ externalLocationId: 'tooling-store-001' }),
    ]);
    expect(
      readFileSync(
        resolve(root, 'infra/aws/lightsail/docker-compose.production.yml'),
        'utf8',
      ),
    ).not.toContain('pressly-one.production-bootstrap.json');
  });
});
