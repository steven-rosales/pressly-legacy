import { composeJobsRuntime } from '@pressly/topology/jobs';
import { presslyObservabilityCatalog } from '@pressly/topology/observability';
import { runJobsProcess } from './process-main.js';

void runJobsProcess(composeJobsRuntime, presslyObservabilityCatalog).catch(
  () => {
    // The selected runtime owns observation and shutdown. This is the final
    // process boundary when even that runtime cannot report safely.
    process.exitCode = 1;
  },
);
