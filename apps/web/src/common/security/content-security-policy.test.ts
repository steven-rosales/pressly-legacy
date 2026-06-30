import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './content-security-policy';

describe('buildContentSecurityPolicy', () => {
  it('builds an enforced production policy for current browser dependencies', () => {
    const policy = buildContentSecurityPolicy({
      apiBaseUrl: 'https://api.trypressly.com/v1',
      isDevelopment: false,
      posthogHost: 'https://us.i.posthog.com',
      sentryDsn: 'https://public-key@o1.ingest.us.sentry.io/123',
    });

    expect(policy).toContain(
      "connect-src 'self' https://api.trypressly.com https://us.i.posthog.com https://us-assets.i.posthog.com https://o1.ingest.us.sentry.io",
    );
    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com",
    );
    expect(policy).toContain('frame-src https://app.trycents.com');
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('localhost');
    expect(policy).not.toContain('\n');
  });

  it('allows the Next.js development runtime without weakening production', () => {
    const policy = buildContentSecurityPolicy({
      apiBaseUrl: 'http://localhost:4000',
      isDevelopment: true,
      posthogHost: 'https://us.i.posthog.com',
    });

    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com 'unsafe-eval'",
    );
    expect(policy).toContain('ws://localhost:*');
    expect(policy).toContain('ws://127.0.0.1:*');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('rejects non-HTTP browser destinations', () => {
    expect(() =>
      buildContentSecurityPolicy({
        apiBaseUrl: 'file:///tmp/pressly',
        isDevelopment: false,
        posthogHost: 'https://us.i.posthog.com',
      }),
    ).toThrow('NEXT_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  });

  it('uses a custom PostHog host for both ingestion and lazy assets', () => {
    const policy = buildContentSecurityPolicy({
      apiBaseUrl: 'https://api.trypressly.com',
      isDevelopment: false,
      posthogHost: 'https://analytics.trypressly.com/ingest',
    });

    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https://analytics.trypressly.com",
    );
    expect(policy.match(/https:\/\/analytics\.trypressly\.com/g)).toHaveLength(
      2,
    );
  });
});
