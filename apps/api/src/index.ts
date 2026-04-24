import { apiEnv } from './common/env.js';

const main = () => {
  console.log({
    app: 'api',
    env: apiEnv.nodeEnv,
    host: apiEnv.host,
    port: apiEnv.port,
  });
};

main();
