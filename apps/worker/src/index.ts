import { workerEnv } from './common/env.js';

const main = () => {
  console.log({
    app: 'worker',
    env: workerEnv.nodeEnv,
    jobsEnabled: workerEnv.features.jobsEnabled,
  });
};

main();
