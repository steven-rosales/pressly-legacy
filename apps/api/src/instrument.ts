import { apiEnv } from './common/config/env.ts';
import { initializeSentry } from './common/observability/sentry.ts';

initializeSentry({
  ...apiEnv.observability.sentry,
  environment: apiEnv.nodeEnv,
});
