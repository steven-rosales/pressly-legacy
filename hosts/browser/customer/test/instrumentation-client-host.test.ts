import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const source = read('../src/instrumentation-client.ts');
describe('Web client instrumentation entrypoint', () => {
  it('starts one Customer browser lifecycle without claiming Next rendering', () => {
    expect(source.match(/\bstartCustomerBrowserHost\s*\(/g)).toHaveLength(1);
    expect(source).toContain('satisfies CustomerBrowserLifecycle');
    expect(source).not.toMatch(/\b(?:createRoot|hydrateRoot)\s*\(/);
    expect(source).not.toContain('react-dom/client');
    expect(source).not.toContain('StrictMode');
    expect(source).toContain("from './customer-browser-host.ts'");
  });

  it('preserves the Next router transition export and instrumentation order', () => {
    expect(source).toContain(
      'export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;',
    );
    const order = [
      source.indexOf('Sentry.init({'),
      source.indexOf('posthog.init(posthogKey'),
      source.indexOf('startCustomerBrowserHost(customerBrowserLifecycle)'),
    ];

    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(source.match(/\bSentry\.init\s*\(/g)).toHaveLength(1);
    expect(source.match(/\bposthog\.init\s*\(/g)).toHaveLength(1);
  });
});
