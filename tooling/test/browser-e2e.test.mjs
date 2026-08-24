import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const smokeFixture = resolve(root, 'tooling/fixtures/production-topology');
const browserFixture = resolve(root, 'tooling/browser-e2e/fixtures');
const browserCompose = resolve(browserFixture, 'docker-compose.browser.yml');
const browserScript = resolve(root, 'tooling/scripts/run-browser-e2e.sh');
const browserSpecDirectory = resolve(root, 'tooling/browser-e2e/specs');
const browserCaddy = resolve(browserFixture, 'Caddyfile');
const apiEnvironment = resolve(root, 'topology/runtime/http/runtime/env.ts');
const webRuntimeSpec = resolve(
  root,
  'tooling/browser-e2e/specs/web-runtime.spec.ts',
);
const webInstrumentation = resolve(
  root,
  'hosts/browser/customer/src/instrumentation-client.ts',
);
const processorProductionJourney = resolve(
  browserSpecDirectory,
  'processor-production-journey.spec.ts',
);
const ciWorkflow = resolve(root, '.github/workflows/ci.yml');

const occurrences = (source, pattern) => [...source.matchAll(pattern)].length;

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
      'hosts/cli/dist/main.js bootstrap owner',
      'hosts/cli/dist/main.js bootstrap production',
      'PRESSLY_BOOTSTRAP_BUSINESS_SLUG=browser-e2e',
      "PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME='Browser E2E'",
      'OWNER_REPLAY_JSON',
      '--actor-id "$OWNER_ID"',
      'access_production_locations',
      'owner and owner-local location rows do not exactly match the bootstrap manifest',
      'node --import tsx tooling/postgres/migrate.ts',
      '--filter=@pressly/generated...',
      '--password-stdin',
      '--fail-on-flaky-tests',
    ]) {
      expect(script).toContain(rail);
    }

    expect(script).not.toContain('trypressly.com');
    expect(script).not.toMatch(/\bgit\s+(?:fetch|checkout|switch|reset)\b/);
    expect(script).not.toMatch(/\bgh\s/);
    expect(script.indexOf('bootstrap owner')).toBeLessThan(
      script.indexOf('bootstrap production'),
    );
    expect(script).not.toContain(
      '--actor-id 00000000-0000-4000-8000-000000000901',
    );
  });

  it('keeps the synthetic owner password off Node argv and on a dedicated input descriptor', () => {
    const script = readFileSync(browserScript, 'utf8');
    const writer = script.slice(
      script.indexOf('OWNER_PASSWORD='),
      script.indexOf('\ncompose()'),
    );
    const writerInvocation = writer
      .split('\n')
      .find((line) => line.startsWith('node --input-type=module'));

    expect(writerInvocation).toBe(
      'node --input-type=module - "$PRESSLY_BROWSER_E2E_CREDENTIAL_FILE" "$OWNER_EMAIL" 3<<<"$OWNER_PASSWORD" <<\'NODE\'',
    );
    expect(writerInvocation?.split(' 3<<<')[0]).not.toContain('OWNER_PASSWORD');
    expect(writer).toContain('const [path, email] = process.argv.slice(2);');
    expect(writer).toContain("readFileSync(3, 'utf8')");
    expect(writer).toContain("flag: 'wx', mode: 0o600");

    const controlSetup = readFileSync(
      resolve(browserSpecDirectory, 'control-auth.setup.ts'),
      'utf8',
    );
    const processorSetup = readFileSync(
      resolve(browserSpecDirectory, 'processor-auth.setup.ts'),
      'utf8',
    );
    expect(
      occurrences(
        `${controlSetup}\n${processorSetup}`,
        /readSyntheticCredential\(\)/g,
      ),
    ).toBe(2);
    expect(processorSetup).toContain('finally {');
    expect(processorSetup).toContain(
      'rm(browserEnvironment.credentialFile, { force: true })',
    );
    expect(script).toContain('rm -rf -- "$RUNTIME_DIR"');
  });

  it('matches both owner-local location rows exactly to the bootstrap manifest', () => {
    const script = readFileSync(browserScript, 'utf8');
    const proof = script.slice(
      script.indexOf('[[ "$(bootstrap_manifest_scalar'),
      script.indexOf('unset OWNER_PASSWORD'),
    );

    expect(script).toContain('-v "bootstrap_manifest=$manifest_json"');
    expect(proof).toContain(
      ":'bootstrap_manifest'::jsonb -> 'location' as location",
    );
    expect(proof).toContain(
      "business_accounts where id = '00000000-0000-4000-8000-000000000100' and slug = 'browser-e2e' and status = 'active'",
    );
    for (const owner of ['access_location', 'production_location']) {
      expect(
        proof.split(`${owner}.id = expected.location ->> 'id'`),
      ).toHaveLength(3);
      expect(proof).toContain(
        `${owner}.business_id = (expected.location ->> 'businessId')::uuid`,
      );
      expect(proof).toContain(`${owner}.name = expected.location ->> 'name'`);
      expect(proof).toContain(
        `${owner}.timezone = expected.location ->> 'timezone'`,
      );
      expect(proof).toContain(
        `${owner}.is_active = (expected.location ->> 'isActive')::boolean`,
      );
    }
    expect(proof).toContain("== '1|1|1|1|1'");
    expect(proof).not.toContain("== '1|1|1'");
    expect(script).toContain(
      'node --import tsx tooling/postgres/seed-pricing.ts',
    );
  });

  it('checks a remote Docker override before invoking Docker', () => {
    const script = readFileSync(browserScript, 'utf8');
    const remoteGuard = script.indexOf('refusing a non-local DOCKER_HOST');
    const firstDockerCall = script.indexOf('docker context show');

    expect(remoteGuard).toBeGreaterThan(-1);
    expect(firstDockerCall).toBeGreaterThan(remoteGuard);
  });

  it('declares five browser images with four public ingress applications', () => {
    const override = readFileSync(browserCompose, 'utf8');
    const caddy = readFileSync(browserCaddy, 'utf8');
    const script = readFileSync(browserScript, 'utf8');
    const bootstrap = JSON.parse(
      readFileSync(resolve(smokeFixture, 'production-bootstrap.json'), 'utf8'),
    );

    expect(override).toContain('depends_on: !override');
    expect(override).toContain("API_CONTROL_MUTATION_RATE_LIMIT: '120'");
    for (const service of ['api', 'web', 'control', 'processor']) {
      expect(override).toContain(`${service}:`);
    }
    expect(caddy).toContain('{$PRESSLY_WEB_DOMAIN:web.pressly.test}');
    expect(caddy).toContain('reverse_proxy web:3000');
    expect(caddy).toContain('{$PRESSLY_API_DOMAIN:api.pressly.test}');
    expect(caddy).toContain('reverse_proxy api:4000');
    expect(script).toContain('compose config --format json');
    expect(script).toContain("published[0].port.host_ip !== '127.0.0.1'");
    expect(script).toContain("['api', 'control', 'processor', 'web']");
    expect(script).toContain('compose build api web worker processor control');
    expect(script).toContain('API_CONTROL_MUTATION_RATE_LIMIT');
    expect(script).toContain("browserControlMutationRateLimit !== '120'");
    expect(readFileSync(apiEnvironment, 'utf8')).toContain(
      'API_CONTROL_MUTATION_RATE_LIMIT: envRateLimit.default(60)',
    );
    expect(script).toContain(
      'compose up -d --wait --wait-timeout 180 api web worker processor control caddy',
    );
    expect(script).toContain('$PROJECT_NAME-web:browser');
    expect(script).not.toContain('$PROJECT_NAME-web:unused');
    expect(script).toContain('$PROJECT_NAME-worker:browser');
    expect(script).not.toContain('$PROJECT_NAME-worker:unused');
    expect(bootstrap.location.businessId).toBe(
      '00000000-0000-4000-8000-000000000100',
    );
  });

  it('keeps smoke at ten tests while full CI selects the production journey', () => {
    const specs = readdirSync(browserSpecDirectory)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(resolve(browserSpecDirectory, name), 'utf8'));
    const smokeTests = specs.flatMap((source) =>
      [...source.matchAll(/\btest\(\s*['"`]@smoke\b/g)].map(
        (match) => match[0],
      ),
    );
    const journey = readFileSync(processorProductionJourney, 'utf8');
    const workflow = readFileSync(ciWorkflow, 'utf8');
    const browserJob = workflow.slice(
      workflow.indexOf('  browser-e2e:'),
      workflow.indexOf('\n  web-docker-build:'),
    );

    expect(smokeTests).toHaveLength(10);
    expect(journey).toContain("test('Processor runs production");
    expect(journey).not.toContain('@smoke');
    expect(journey).toContain('productionAdvanceStageV1');
    expect(journey).toContain('productionSubscribeChangesV1');
    expect(journey).toContain("getByRole('button'");
    expect(browserJob).toContain('run: pnpm test:browser:e2e');
    expect(browserJob).not.toContain('run: pnpm test:browser:smoke');
  });

  it('keeps browser origins and credential artifacts explicitly local', () => {
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
    expect(environment).toContain('web.pressly.test');
    expect(environment).toContain('api.pressly.test');
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

  it('proves Web SSR and one-document client navigation without copy selectors', () => {
    const spec = readFileSync(webRuntimeSpec, 'utf8');

    expect(spec).toContain('serverResponse.text()');
    expect(spec).toContain('dropdown-menu-trigger');
    expect(spec).toContain('dropdown-menu-content');
    expect(spec).toContain('documentRequests');
    expect(spec).toContain('__presslyBrowserE2eDocument');
    expect(spec).toContain('pageerror');
    expect(spec).toContain('a[href="/services-pricing/wash-fold"]');
    expect(spec).not.toMatch(/getByText|getByRole\([^\n]+name:/);
  });

  it('keeps analytics and observability startup single-sourced', () => {
    const instrumentation = readFileSync(webInstrumentation, 'utf8');

    expect(occurrences(instrumentation, /\bSentry\.init\s*\(/g)).toBe(1);
    expect(occurrences(instrumentation, /\bposthog\.init\s*\(/g)).toBe(1);
    expect(
      occurrences(instrumentation, /\bstartCustomerBrowserHost\s*\(/g),
    ).toBeLessThanOrEqual(1);
  });

  it('permits shadcn positioning styles without weakening script execution', () => {
    const securityBoundaries = [
      resolve(root, 'deploy/images/control/nginx.conf'),
      resolve(root, 'deploy/aws/lightsail/Caddyfile'),
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
