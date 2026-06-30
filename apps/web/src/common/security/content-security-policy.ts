type ContentSecurityPolicyInput = Readonly<{
  apiBaseUrl: string;
  isDevelopment: boolean;
  posthogHost: string;
  sentryDsn?: string;
}>;

const sourceOrigin = (name: string, value: string): string => {
  const url = new URL(value);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTP or HTTPS.`);
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
