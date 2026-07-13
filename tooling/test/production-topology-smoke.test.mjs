import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const productionCompose = resolve(
  root,
  'infra/aws/lightsail/docker-compose.production.yml',
);
const fixtureDirectory = resolve(root, 'tooling/fixtures/production-topology');
const smokeCompose = resolve(fixtureDirectory, 'docker-compose.smoke.yml');
const smokeScript = resolve(
  root,
  'tooling/scripts/production-topology-smoke.sh',
);
const project = 'pressly-v2-smoke-test';
const port = '24443';
const runtimeSecret = randomBytes(32).toString('hex');
const imageEnvironment = Object.fromEntries(
  ['API', 'WEB', 'WORKER', 'PROCESSOR'].map((service) => [
    `PRESSLY_${service}_IMAGE`,
    `${project}-${service.toLowerCase()}:release-a`,
  ]),
);

const renderSmokeCompose = () =>
  JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--project-name',
        project,
        '-f',
        productionCompose,
        '-f',
        smokeCompose,
        'config',
        '--format',
        'json',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...imageEnvironment,
          PRESSLY_SMOKE_REPO_ROOT: root,
          PRESSLY_SMOKE_FIXTURE_DIR: fixtureDirectory,
          PRESSLY_SMOKE_CADDY_PORT: port,
          PRESSLY_SMOKE_DATABASE_PASSWORD: runtimeSecret,
          PRESSLY_SMOKE_AUTH_SECRET: runtimeSecret,
          PRESSLY_SMOKE_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
          PRESSLY_SMOKE_CSRF_SECRET: runtimeSecret,
          PRESSLY_SMOKE_CENTS_HMAC_KEY: runtimeSecret,
        },
      },
    ),
  );

describe('offline production topology smoke harness', () => {
  it('has valid Bash syntax and hard local-only teardown rails', () => {
    expect(spawnSync('bash', ['-n', smokeScript]).status).toBe(0);
    const script = readFileSync(smokeScript, 'utf8');

    for (const proofRail of [
      'docker context inspect',
      'DOCKER_HOST',
      'unix://*',
      'pressly-v2-smoke-',
      "--noproxy '*'",
      '127.0.0.1',
      'trap cleanup EXIT',
      'compose down --volumes --remove-orphans',
      'docker network ls',
      'docker volume ls',
      'projectContainersRemaining: 0',
      'release-a',
      'release-b',
      'swap_metadata_for_rollback',
      "docker inspect --format '{{.Config.Image}}'",
      'X-Cents-Signature',
      '/api/processor/auth/login',
      'processor_csrf_rejected',
      'invalid_session',
      'docker stats --no-stream',
    ])
      expect(script).toContain(proofRail);

    expect(script).not.toMatch(/\bgit\s+(?:fetch|checkout|switch|reset)\b/);
    expect(script).not.toMatch(/\bgh\s/);
    expect(script).not.toContain('trypressly.com');
    expect(script).not.toContain('OfflineSmoke!Passphrase2026');
    expect(script).toContain("randomBytes(24).toString('base64url') + 'Aa1!'");
  });

  it('fails closed before using a remote Docker host override', () => {
    const result = spawnSync('bash', [smokeScript, '--skip-build'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_HOST: 'tcp://example.invalid:2375',
        DOCKER_CONTEXT: '',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing non-local DOCKER_HOST override.');
    expect(result.stdout).toBe('');
  });

  it('renders local HTTPS with only Caddy published and production Dockerfiles', () => {
    const config = renderSmokeCompose();
    const published = Object.entries(config.services).flatMap(
      ([service, definition]) =>
        (definition.ports ?? []).map((mapping) => ({ service, mapping })),
    );

    expect(config.name).toBe(project);
    expect(published).toEqual([
      {
        service: 'caddy',
        mapping: expect.objectContaining({
          host_ip: '127.0.0.1',
          published: port,
          target: 443,
        }),
      },
    ]);
    expect(config.services.caddy.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: resolve(fixtureDirectory, 'Caddyfile.smoke'),
          target: '/etc/caddy/Caddyfile',
          read_only: true,
        }),
      ]),
    );
    expect(config.services.api.environment).toMatchObject({
      NODE_ENV: 'production',
      PROCESSOR_ORIGIN: `https://processor.pressly.test:${port}`,
    });
    expect(config.services.web.build.args).toMatchObject({
      NEXT_PUBLIC_API_BASE_URL: `https://api.pressly.test:${port}`,
    });
    expect(config.services.processor.build.args).toMatchObject({
      VITE_API_URL: '/api',
    });
    expect(config.services.worker.ports).toBeUndefined();
    expect(config.services.worker.expose).toBeUndefined();

    for (const service of ['api', 'web', 'worker', 'processor']) {
      expect(config.services[service].build).toMatchObject({
        context: root,
        dockerfile: `apps/${service}/Dockerfile`,
      });
      expect(config.services[service].read_only).toBe(true);
    }
  });

  it('publishes a passing report only after verified disposable teardown', () => {
    const script = readFileSync(smokeScript, 'utf8');
    const teardownIndex = script.indexOf(
      'compose down --volumes --remove-orphans',
    );
    const residueIndex = script.indexOf('projectContainersRemaining: 0');
    const passedIndex = script.indexOf(
      'offline topology proof passed and disposable Docker resources were removed',
    );

    expect(teardownIndex).toBeGreaterThan(-1);
    expect(residueIndex).toBeGreaterThan(teardownIndex);
    expect(passedIndex).toBeGreaterThan(residueIndex);
    expect(script).toContain(
      'if ((exit_code == 0)) && [[ "$cleanup_failed" == true ]]',
    );
    expect(script).toContain(
      '[[ "$REPORT_CREATED" == true ]] && rm -f "$REPORT_PATH"\n    exit_code=1',
    );
    expect(script.match(/offline topology proof passed/g)).toHaveLength(1);
  });

  it('uses internal TLS and secret-free synthetic fixtures', () => {
    const caddyfile = readFileSync(
      resolve(fixtureDirectory, 'Caddyfile.smoke'),
      'utf8',
    );
    expect(caddyfile.match(/tls internal/g)).toHaveLength(3);
    expect(caddyfile).toContain('@processor_api path /api /api/*');
    expect(caddyfile).toContain('uri strip_prefix /api');

    const envFixtures = readdirSync(resolve(fixtureDirectory, 'env')).map(
      (file) => readFileSync(resolve(fixtureDirectory, 'env', file), 'utf8'),
    );
    const fixtures = [
      caddyfile,
      readFileSync(smokeCompose, 'utf8'),
      readFileSync(smokeScript, 'utf8'),
      readFileSync(
        resolve(fixtureDirectory, 'production-bootstrap.json'),
        'utf8',
      ),
      ...envFixtures,
    ].join('\n');
    expect(fixtures).not.toMatch(/trypressly\.com/i);
    expect(fixtures).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(fixtures).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
    expect(fixtures).not.toMatch(/Bearer\s+[A-Za-z0-9._~-]+/i);
    expect(fixtures).toContain('offline-smoke-location');
    for (const envFixture of envFixtures)
      expect(envFixture).not.toMatch(
        /^(?:DATABASE_URL|POSTGRES_PASSWORD|AUTH_SECRET|AUTH_MFA_ENCRYPTION_KEY|PROCESSOR_CSRF_SECRET|CENTS_WEBHOOK_HMAC_CURRENT_KEY)=.+$/m,
      );
  });
});
