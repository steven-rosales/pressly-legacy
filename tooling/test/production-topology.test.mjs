import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const composeFile = resolve(
  root,
  'infra/aws/lightsail/docker-compose.production.yml',
);
const composeEnv = resolve(root, 'infra/aws/docs/env/compose.env.example');

const renderCompose = () =>
  JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        composeEnv,
        '-f',
        composeFile,
        'config',
        '--format',
        'json',
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  );

describe('production topology', () => {
  it('renders all four applications while publishing only Caddy', () => {
    const config = renderCompose();
    const services = config.services;

    expect(Object.keys(services)).toEqual(
      expect.arrayContaining([
        'api',
        'web',
        'worker',
        'processor',
        'caddy',
        'postgres',
      ]),
    );
    expect(services.caddy.ports).toHaveLength(2);
    for (const [name, service] of Object.entries(services)) {
      if (name !== 'caddy') expect(service.ports).toBeUndefined();
    }

    expect(services.worker.expose).toBeUndefined();
    expect(services.worker.read_only).toBe(true);
    expect(services.worker.cap_drop).toContain('ALL');
    expect(services.worker.healthcheck.test).toContain(
      'apps/worker/dist/healthcheck.js',
    );
    expect(services.processor.expose).toEqual(['80']);
    expect(services.processor.read_only).toBe(true);
    expect(services.processor.cap_drop).toContain('ALL');

    for (const name of ['api', 'web', 'worker', 'processor'])
      expect(services[name].image).toMatch(/@sha256:[0-9a-f]{64}$/);
  });

  it('routes same-origin processor API traffic with the prefix removed', () => {
    const caddyfile = readFileSync(
      resolve(root, 'infra/aws/lightsail/Caddyfile'),
      'utf8',
    );

    expect(caddyfile).toContain(
      '{$PRESSLY_PROCESSOR_DOMAIN:processor.trypressly.com}',
    );
    expect(caddyfile).toContain('@processor_api path /api /api/*');
    expect(caddyfile).toContain('uri strip_prefix /api');
    expect(caddyfile).toContain('reverse_proxy api:4000');
    expect(caddyfile).toContain('reverse_proxy processor:80');
  });
});
