import { workerEnv } from '../env.ts';
import {
  initializeWorkerSentry,
  requireWorkerSentryInitialization,
} from './worker-observability.ts';

const sentryEnabled = workerEnv.observability.sentry.enabled;
const sentryInitialized = initializeWorkerSentry({
  ...workerEnv.observability.sentry,
  environment: workerEnv.nodeEnv,
});

requireWorkerSentryInitialization(sentryEnabled, sentryInitialized);
