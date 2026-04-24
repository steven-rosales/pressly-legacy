import { webEnv } from './common/env.js';

const main = () => {
  console.log({
    app: 'web',
    env: webEnv.nodeEnv,
    apiBaseUrl: webEnv.apiBaseUrl,
  });
};

main();
