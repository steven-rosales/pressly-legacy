import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import { buildContentSecurityPolicy } from './src/common/security/content-security-policy';

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(webRoot, '../..');
const isDockerBuild = process.env['PRESSLY_DOCKER_BUILD'] === 'true';
const isDevelopment = process.env['NODE_ENV'] === 'development';

const contentSecurityPolicy = buildContentSecurityPolicy({
  apiBaseUrl:
    process.env['NEXT_PUBLIC_API_BASE_URL'] ??
    (isDevelopment ? 'http://localhost:4000' : 'https://api.trypressly.com'),
  isDevelopment,
  posthogHost:
    process.env['NEXT_PUBLIC_POSTHOG_HOST'] ?? 'https://us.i.posthog.com',
  ...(process.env['NEXT_PUBLIC_SENTRY_DSN']
    ? { sentryDsn: process.env['NEXT_PUBLIC_SENTRY_DSN'] }
    : {}),
});

const canonicalUrl = 'https://trypressly.com';
const canonicalRedirectHosts = [
  'www.trypressly.com',
  'pressely.com',
  'www.pressely.com',
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  skipTrailingSlashRedirect: true,
  images: {
    qualities: [75, 100],
  },
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 25,
  },
  devIndicators: { position: 'bottom-right' },
  ...(isDockerBuild
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: repoRoot,
      }
    : {}),
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  async redirects() {
    return [
      ...canonicalRedirectHosts.map((host) => ({
        source: '/:path*',
        has: [{ type: 'host' as const, value: host }],
        destination: `${canonicalUrl}/:path*`,
        permanent: true,
      })),
      { source: '/home', destination: '/', permanent: true },
      { source: '/landing', destination: '/', permanent: true },
      { source: '/blog', destination: '/', permanent: true },
      {
        source: '/blog/cost-of-wash-and-fold-laundry-service-in-new-jersey',
        destination: '/services-pricing/wash-fold',
        permanent: true,
      },
      {
        source: '/schedule-pickup',
        destination: '/schedule',
        permanent: true,
      },
      {
        source: '/schedule-pickup-landing',
        destination: '/schedule',
        permanent: true,
      },
      {
        source: '/schedule-promotion',
        destination: '/schedule',
        permanent: true,
      },
      {
        source: '/app-for-laundry',
        destination: '/schedule',
        permanent: true,
      },
      {
        source: '/dry-cleaning-landing',
        destination: '/services-pricing/dry-cleaning',
        permanent: true,
      },
      {
        source: '/wash-and-fold-landing',
        destination: '/services-pricing/wash-fold',
        permanent: true,
      },
      {
        source: '/wash-and-fold-landing-1',
        destination: '/services-pricing/wash-fold',
        permanent: true,
      },
      {
        source: '/new-jersey/laundry-service-in-:county',
        destination: '/new-jersey/:county',
        permanent: true,
      },
      {
        source: '/new-jersey/dry-cleaners-in-:county',
        destination: '/new-jersey/:county',
        permanent: true,
      },
      {
        source: '/jersey-city',
        destination: '/new-jersey/hudson-county/laundry-service-in-jersey-city',
        permanent: true,
      },
      {
        source: '/newark',
        destination: '/new-jersey/essex-county/laundry-service-in-newark',
        permanent: true,
      },
      {
        source: '/paterson',
        destination: '/new-jersey/passaic-county/laundry-service-in-paterson',
        permanent: true,
      },
      {
        source: '/elizabeth',
        destination: '/new-jersey/union-county/laundry-service-in-elizabeth',
        permanent: true,
      },
      {
        source: '/clifton',
        destination: '/new-jersey/passaic-county/laundry-service-in-clifton',
        permanent: true,
      },
      {
        source: '/hoboken',
        destination: '/new-jersey/hudson-county/laundry-service-in-hoboken',
        permanent: true,
      },
      {
        source: '/midland-park-laundry',
        destination:
          '/new-jersey/bergen-county/laundry-service-in-midland-park',
        permanent: true,
      },
      {
        source: '/garwood-dry-cleaners',
        destination: '/new-jersey/union-county',
        permanent: true,
      },
      {
        source: '/pressly-images',
        destination: '/',
        permanent: true,
      },
      {
        source: '/documentation',
        destination: '/',
        permanent: true,
      },
      {
        source: '/documentation-1',
        destination: '/',
        permanent: true,
      },
      {
        source: '/documentation-3',
        destination: '/',
        permanent: true,
      },
      {
        source: '/videos',
        destination: '/',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'pressly-laundry-service-dry-cl',

  project: 'pressly-web',

  silent: !process.env['CI'],

  widenClientFileUpload: true,

  tunnelRoute: '/monitoring',

  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
  ...(process.env['SENTRY_AUTH_TOKEN'] && {
    authToken: process.env['SENTRY_AUTH_TOKEN'],
  }),
});
