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
  readFileSync(resolve(root, 'hosts/cli/package.json'), 'utf8'),
);
const variableOrdersFixture = readFileSync(
  resolve(root, 'tooling/fixtures/local-processor-variable-orders.sql'),
  'utf8',
);

const insertedColumns = (table) => {
  const match = variableOrdersFixture.match(
    new RegExp(`INSERT INTO ${table} \\(([^)]+)\\)`, 'u'),
  );
  expect(match, `missing ${table} fixture insert`).not.toBeNull();
  return match[1].split(',').map((column) => column.trim());
};

describe('local development topology', () => {
  it('bootstraps the Access business and owner before the owner-local Production topology', () => {
    const command = compose.services.bootstrap.command;
    const apiCommand = compose.services.api.command;
    const ownerBootstrap = command.indexOf('bootstrap owner');
    const productionBootstrap = command.indexOf('bootstrap production');

    expect(ownerBootstrap).toBeGreaterThan(-1);
    expect(productionBootstrap).toBeGreaterThan(ownerBootstrap);
    expect(command).toContain(
      'node hosts/cli/dist/main.js bootstrap production',
    );
    expect(command).toContain('node hosts/cli/dist/main.js bootstrap owner');
    expect(command).toContain('@pressly/cli-host build:workspace-deps');
    expect(command).toContain('/run/secrets/local_bootstrap_owner_password');
    expect(command).toContain(String.raw`\"$$OWNER_BOOTSTRAP_RESULT\"`);
    expect(apiCommand).toContain('@pressly/http-host dev');
    expect(apiCommand).not.toContain('bootstrap owner');
    expect(apiCommand).not.toContain('local_bootstrap_owner_password');
    expect(command).toContain(
      '/repo/tooling/fixtures/pressly-one.production-bootstrap.json',
    );
    expect(command).toContain(
      'local-pressly-one-topology-$$(sha256sum /repo/tooling/fixtures/pressly-one.production-bootstrap.json | cut -c1-16)',
    );
    expect(command).toContain('--apply');
    expect(command).toContain('--actor-id $$OWNER_ID');
    expect(command).not.toContain(
      '--actor-id 00000000-0000-4000-8000-000000000001',
    );
    expect(compose.services.bootstrap.environment).toMatchObject({
      PRESSLY_BOOTSTRAP_BUSINESS_ID: '00000000-0000-4000-8000-000000000100',
      PRESSLY_BOOTSTRAP_BUSINESS_SLUG: 'pressly-one',
      PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME: 'Pressly One',
      PRESSLY_BOOTSTRAP_OWNER_CONFIRM: 'bootstrap-first-owner',
    });
    expect(compose.services.bootstrap.secrets).toEqual([
      'local_bootstrap_owner_password',
    ]);
    expect(compose.services.bootstrap.restart).toBe('no');
    expect(compose.services.api.secrets).toBeUndefined();
    expect(compose.services.api.environment).not.toHaveProperty(
      'PRESSLY_BOOTSTRAP_OWNER_EMAIL',
    );
    expect(compose.services.api.depends_on.bootstrap).toEqual({
      condition: 'service_completed_successfully',
    });
    expect(compose.services.worker.depends_on.bootstrap).toEqual({
      condition: 'service_completed_successfully',
    });
    expect(compose.secrets.local_bootstrap_owner_password).toEqual({
      environment: 'PRESSLY_LOCAL_BOOTSTRAP_OWNER_PASSWORD',
    });
    expect(command).not.toContain('PRESSLY_LOCAL_BOOTSTRAP_OWNER_PASSWORD');
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
        resolve(root, 'deploy/aws/lightsail/docker-compose.production.yml'),
        'utf8',
      ),
    ).not.toContain('pressly-one.production-bootstrap.json');
  });

  it('keeps variable-order fixture writes aligned with owner-local ancestry', () => {
    for (const table of [
      'users',
      'orders',
      'order_items',
      'order_fulfillments',
    ]) {
      expect(insertedColumns(table)).toContain('business_id');
    }

    expect(insertedColumns('order_fulfillments')).not.toContain('bag_count');
    expect(variableOrdersFixture).toContain(
      "'00000000-0000-4000-8000-000000000100'::uuid AS business_id",
    );
  });
});
