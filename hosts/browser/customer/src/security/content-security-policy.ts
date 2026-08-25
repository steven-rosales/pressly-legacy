import type { Result } from '@pressly/cells/result';

type ContentSecurityPolicyInput = Readonly<{
  apiBaseUrl: string;
  isDevelopment: boolean;
  posthogHost: string;
  sentryDsn?: string;
}>;

type ContentSecurityPolicyFailure = Readonly<{
  code: 'invalid_content_security_policy_origin';
  message: string;
  details: Readonly<{ name: string; protocol?: string }>;
  cause?: unknown;
}>;

const invalidOrigin = (
  name: string,
  message: string,
  input: Readonly<{ protocol?: string; cause?: unknown }> = {},
): Result<string, ContentSecurityPolicyFailure> => ({
  tag: 'err',
  error: {
    code: 'invalid_content_security_policy_origin',
    message,
    details: {
      name,
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
    },
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  },
});

const sourceOrigin = (
  name: string,
  value: string,
): Result<string, ContentSecurityPolicyFailure> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    return invalidOrigin(name, `${name} must be a valid absolute URL.`, {
      cause,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return invalidOrigin(name, `${name} must use HTTP or HTTPS.`, {
      protocol: url.protocol,
    });
  }

  return { tag: 'ok', value: url.origin };
};

const posthogAssetOrigin = (posthogOrigin: string): string => {
  const cloudRegion = /^https:\/\/(us|eu)\.i\.posthog\.com$/.exec(
    posthogOrigin,
  )?.[1];

  return cloudRegion
    ? `https://${cloudRegion}-assets.i.posthog.com`
    : posthogOrigin;
};

export const buildContentSecurityPolicy = ({
  apiBaseUrl,
  isDevelopment,
  posthogHost,
  sentryDsn,
}: ContentSecurityPolicyInput): Result<
  string,
  ContentSecurityPolicyFailure
> => {
  const posthogOriginResult = sourceOrigin(
    'NEXT_PUBLIC_POSTHOG_HOST',
    posthogHost,
  );
  if (posthogOriginResult.tag === 'err') return posthogOriginResult;

  const apiOriginResult = sourceOrigin('NEXT_PUBLIC_API_BASE_URL', apiBaseUrl);
  if (apiOriginResult.tag === 'err') return apiOriginResult;

  const posthogOrigin = posthogOriginResult.value;
  const posthogAssets = posthogAssetOrigin(posthogOrigin);
  const connectSources = new Set([
    "'self'",
    apiOriginResult.value,
    posthogOrigin,
    posthogAssets,
  ]);

  if (sentryDsn) {
    const sentryOriginResult = sourceOrigin(
      'NEXT_PUBLIC_SENTRY_DSN',
      sentryDsn,
    );
    if (sentryOriginResult.tag === 'err') return sentryOriginResult;
    connectSources.add(sentryOriginResult.value);
  }

  if (isDevelopment) {
    connectSources.add('ws://localhost:*');
    connectSources.add('ws://127.0.0.1:*');
  }

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${posthogAssets}${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${[...connectSources].join(' ')}`,
    'frame-src https://app.trycents.com',
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDevelopment) directives.push('upgrade-insecure-requests');

  return { tag: 'ok', value: directives.join('; ') };
};
