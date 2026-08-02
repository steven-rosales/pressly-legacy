import { configError } from '@pressly/errors';

type ContentSecurityPolicyInput = Readonly<{
  apiBaseUrl: string;
  isDevelopment: boolean;
  posthogHost: string;
  sentryDsn?: string;
}>;

const sourceOrigin = (name: string, value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw configError({
      code: 'invalid_content_security_policy_origin',
      message: `${name} must be a valid absolute URL.`,
      cause,
      details: { name },
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw configError({
      code: 'invalid_content_security_policy_origin',
      message: `${name} must use HTTP or HTTPS.`,
      details: { name, protocol: url.protocol },
    });
  }

  return url.origin;
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
}: ContentSecurityPolicyInput): string => {
  const posthogOrigin = sourceOrigin('NEXT_PUBLIC_POSTHOG_HOST', posthogHost);
  const posthogAssets = posthogAssetOrigin(posthogOrigin);
  const connectSources = new Set([
    "'self'",
    sourceOrigin('NEXT_PUBLIC_API_BASE_URL', apiBaseUrl),
    posthogOrigin,
    posthogAssets,
  ]);

  if (sentryDsn) {
    connectSources.add(sourceOrigin('NEXT_PUBLIC_SENTRY_DSN', sentryDsn));
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

  return directives.join('; ');
};
