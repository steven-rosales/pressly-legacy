import { apiEnv } from '../env.ts';
import { initializeSentry, requireApiSentryInitialization } from './sentry.ts';

const sentryEnabled = apiEnv.observability.sentry.enabled;
const sentryInitialized = initializeSentry({
  ...apiEnv.observability.sentry,
  environment: apiEnv.nodeEnv,
});

requireApiSentryInitialization(sentryEnabled, sentryInitialized);
