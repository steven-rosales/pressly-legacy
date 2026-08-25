import { composeJobsRuntime } from '@pressly/generated-runtime/jobs';
import { runJobsProcess } from './process-main.js';

void runJobsProcess(composeJobsRuntime).catch(() => {
  // The selected runtime owns observation and shutdown. This is the final
  // process boundary when even that runtime cannot report safely.
  process.exitCode = 1;
});
