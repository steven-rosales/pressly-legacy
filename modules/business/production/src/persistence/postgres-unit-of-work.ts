import type { Database, DatabaseExecutor } from '@pressly/db';
import type { Transactional } from '../production.port.ts';

export const makePostgresUnitOfWork = <Operations>(
  db: Database,
  makeOperations: (transaction: DatabaseExecutor) => Operations,
): Transactional<Operations> => ({
  transaction: (work) =>
    db.transaction((transaction) => work(makeOperations(transaction))),
});
