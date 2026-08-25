import type { ResultUnitOfWork } from '@pressly/cells/unit-of-work';

/** App-owned telemetry may decorate a cell unit of work without owning it. */
export type ProductionResultUnitOfWorkObserver = <Operations>(
  unitOfWork: ResultUnitOfWork<Operations>,
) => ResultUnitOfWork<Operations>;
