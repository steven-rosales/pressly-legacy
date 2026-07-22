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
      'apps/worker/dist/runtime/healthcheck.js',
    );
    expect(services.processor.expose).toEqual(['80']);
    expect(services.processor.read_only).toBe(true);
    expect(services.processor.cap_drop).toContain('ALL');
    expect(services.api.environment.SENTRY_RELEASE).toBe('e'.repeat(40));
    expect(services.worker.environment.SENTRY_RELEASE).toBe('e'.repeat(40));
    expect(services.api.environment.NODE_ENV).toBe('production');
    expect(services.worker.environment.NODE_ENV).toBe('production');
    expect(services.api.environment.SENTRY_ENABLED).toBe('true');
    expect(services.api.environment.FEATURE_METRICS_ENABLED).toBe('true');
    expect(services.worker.environment.SENTRY_ENABLED).toBe('true');

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

  it('redirects the www web hostname to the canonical hostname', () => {
    const caddyfile = readFileSync(
      resolve(root, 'infra/aws/lightsail/Caddyfile'),
      'utf8',
    );

    expect(caddyfile).toContain('www.{$PRESSLY_WEB_DOMAIN:trypressly.com}');
    expect(caddyfile).toContain(
      'redir https://{$PRESSLY_WEB_DOMAIN:trypressly.com}{uri} permanent',
    );
  });
});
