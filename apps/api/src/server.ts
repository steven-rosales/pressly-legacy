import type { Server } from 'node:http';
import type express from 'express';
import type { Logger } from '@pressly/logging';

export const startServer = (input: {
  app: express.Express;
  host: string;
  port: number;
  logger: Logger;
}): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = input.app.listen(input.port, input.host, () => {
      input.logger.info('api server started', {
        host: input.host,
        port: input.port,
      });

      resolve(server);
    });

    server.on('error', reject);
  });
