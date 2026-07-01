import { workerEnv } from './common/env.js';

const main = () => {
  if (!workerEnv.features.jobsEnabled) return;
};

main();
