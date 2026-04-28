import { apiEnv } from './common/config/env.js';

const main = () => {
  console.log({
    app: 'api',
    env: apiEnv.nodeEnv,
    host: apiEnv.host,
    port: apiEnv.port,
  });
};

main();
