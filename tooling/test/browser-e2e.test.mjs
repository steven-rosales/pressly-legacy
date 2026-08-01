import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const smokeFixture = resolve(root, 'tooling/fixtures/production-topology');
const browserFixture = resolve(root, 'tooling/browser-e2e/fixtures');
const browserCompose = resolve(browserFixture, 'docker-compose.browser.yml');
const browserScript = resolve(root, 'tooling/scripts/run-browser-e2e.sh');

describe('browser e2e harness', () => {
  it('has valid Bash syntax and fails closed around local disposable resources', () => {
    expect(spawnSync('bash', ['-n', browserScript]).status).toBe(0);
    const script = readFileSync(browserScript, 'utf8');

    for (const rail of [
      'docker context inspect',
      'DOCKER_HOST',
      'unix://*',
      'pressly-browser-e2e-',
      '127.0.0.1',
      'trap cleanup EXIT',
      'compose down --volumes --remove-orphans',
      'docker network ls',
      'docker volume ls',
      'PRESSLY_BROWSER_E2E_CREDENTIAL_FILE',
      'owner@browser-e2e.invalid',
      '--password-stdin',
      '--fail-on-flaky-tests',
    ]) {
      expect(script).toContain(rail);
    }

    expect(script).not.toContain('trypressly.com');
    expect(script).not.toMatch(/\bgit\s+(?:fetch|checkout|switch|reset)\b/);
    expect(script).not.toMatch(/\bgh\s/);
  });

  it('checks a remote Docker override before invoking Docker', () => {
    const script = readFileSync(browserScript, 'utf8');
    const remoteGuard = script.indexOf('refusing a non-local DOCKER_HOST');
    const firstDockerCall = script.indexOf('docker context show');

    expect(remoteGuard).toBeGreaterThan(-1);
    expect(firstDockerCall).toBeGreaterThan(remoteGuard);
  });

  it('declares a three-service browser ingress and runtime render validation', () => {
    const override = readFileSync(browserCompose, 'utf8');
    const script = readFileSync(browserScript, 'utf8');
    const bootstrap = JSON.parse(
      readFileSync(resolve(smokeFixture, 'production-bootstrap.json'), 'utf8'),
    );

    expect(override).toContain('depends_on: !override');
    for (const service of ['api', 'control', 'processor']) {
      expect(override).toContain(`${service}:`);
    }
    expect(script).toContain('compose config --format json');
    expect(script).toContain("published[0].port.host_ip !== '127.0.0.1'");
    expect(script).toContain("['api', 'control', 'processor']");
    expect(bootstrap.location.businessId).toBe(
      '00000000-0000-4000-8000-000000000100',
    );
  });

  it('keeps credentialed browser origins and artifacts explicitly local', () => {
    const environment = readFileSync(
      resolve(root, 'tooling/browser-e2e/support/environment.ts'),
      'utf8',
    );
    const config = readFileSync(
      resolve(root, 'tooling/browser-e2e/playwright.config.ts'),
      'utf8',
    );
    const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
    const authentication = readFileSync(
      resolve(root, 'tooling/browser-e2e/support/authentication.ts'),
      'utf8',
    );
    const workforceJourney = readFileSync(
      resolve(root, 'tooling/browser-e2e/specs/workforce-role-journey.spec.ts'),
      'utf8',
    );

    expect(environment).toContain('control.pressly.test');
    expect(environment).toContain('processor.pressly.test');
    expect(environment).toContain('/tmp/pressly-browser-e2e.');
    expect(environment).not.toContain('trypressly.com');
    expect(config).toContain('workers: 1');
    expect(config).toContain('retries: ci ? 1 : 0');
    expect(ignore).toContain('.artifacts/');
    expect(authentication).toContain('verifyProcessorWithTotp');
    expect(authentication).not.toContain('verifyProcessorWithRecoveryCode');
    expect(workforceJourney).toContain(
      'storageState: { cookies: [], origins: [] }',
    );
  });

  it('permits shadcn positioning styles without weakening script execution', () => {
    const securityBoundaries = [
      resolve(root, 'apps/control/nginx.conf'),
      resolve(root, 'infra/aws/lightsail/Caddyfile'),
      resolve(smokeFixture, 'Caddyfile.smoke'),
      resolve(browserFixture, 'Caddyfile'),
    ].map((path) => readFileSync(path, 'utf8'));

    for (const boundary of securityBoundaries) {
      expect(boundary).toContain("script-src 'self'");
      expect(boundary).not.toContain("script-src 'self' 'unsafe-inline'");
      expect(boundary).toContain("style-src-attr 'unsafe-inline'");
      expect(boundary).toContain("style-src-elem 'self' 'unsafe-inline'");
    }
  });
});
