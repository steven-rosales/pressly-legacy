import { createQueryRuntime, type QueryRuntime } from '../../actions/query';
import type { WebCorePorts } from './ports';

export type WebCore = WebCorePorts &
  Readonly<{
    query: QueryRuntime;
  }>;

export const createWebCore = (ports: WebCorePorts): WebCore =>
  Object.freeze({
    ...ports,
    query: createQueryRuntime(ports),
  });
