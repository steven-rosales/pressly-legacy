import { apiEnv } from '../env.ts';
import { initializeSentry } from './sentry.ts';

initializeSentry({
  ...apiEnv.observability.sentry,
  environment: apiEnv.nodeEnv,
});
