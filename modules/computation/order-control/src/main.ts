import { projectSourceComparison } from './project-source-comparison/project-source-comparison.computation.ts';

export const makeOrderControlProjection = () => ({
  compareSource: projectSourceComparison,
});

export type OrderControlProjection = ReturnType<
  typeof makeOrderControlProjection
>;
