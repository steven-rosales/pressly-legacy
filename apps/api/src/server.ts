/**
 * `server.ts` creates the http server.
 */

import http, { type Server } from 'node:http';
import type express from 'express';
import type { Logger } from '@pressly/logging';

export type StartedServer = Readonly<{
  server: Server;
  close: () => Promise<void>;
  forceClose: () => void;
}>;

export const startServer = (input: {
  app: express.Express;
  host: string;
  port: number;
  logger: Logger;
}): Promise<StartedServer> =>
  new Promise((resolve, reject) => {
    const server = http.createServer(input.app);

    server.requestTimeout = 30_000;
    server.headersTimeout = 35_000;
    server.keepAliveTimeout = 5_000;

    server.on('clientError', (error, socket) => {
      input.logger.warn('api client socket error', { error });

      if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });

    server.once('error', reject);

    server.listen(input.port, input.host, () => {
      server.off('error', reject);

      input.logger.info('api server started', {
        host: input.host,
        port: input.port,
      });

      resolve({
        server,

        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });

            server.closeIdleConnections();
          }),

        forceClose: () => {
          server.closeAllConnections();
        },
      });
    });
  });
