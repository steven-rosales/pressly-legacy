import {
  productionIdSchema,
  type ListProductionOrderControlQuery,
  type ProductionOrderRouteAttempt,
} from '@pressly/contracts';

export type ProductionOrderControlCursor = Readonly<{
  dueAt: string;
  id: string;
}>;

type EncodedProductionOrderControlCursor = ProductionOrderControlCursor &
  Readonly<{
    version: 1;
    filterKey: string;
  }>;

export const productionOrderControlFilterKey = (
  query: ListProductionOrderControlQuery,
): string =>
  JSON.stringify({
    view: query.view,
    search: query.search ?? null,
    status: query.status ?? null,
    dueBucket: query.dueBucket ?? null,
    productionRunId: query.productionRunId ?? null,
    productionBatchId: query.productionBatchId ?? null,
    stage: query.stage ?? null,
    priority: query.priority ?? null,
    movable: query.movable ?? null,
  });

export const encodeProductionOrderControlCursor = (
  filterKey: string,
  cursor: ProductionOrderControlCursor,
): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      filterKey,
      ...cursor,
    } satisfies EncodedProductionOrderControlCursor),
    'utf8',
  ).toString('base64url');

export const decodeProductionOrderControlCursor = (
  cursor: string,
  filterKey: string,
): ProductionOrderControlCursor | null => {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return null;
    const dueAt = Reflect.get(value, 'dueAt');
    const id = Reflect.get(value, 'id');
    const version = Reflect.get(value, 'version');
    const encodedFilterKey = Reflect.get(value, 'filterKey');
    if (
      version !== 1 ||
      encodedFilterKey !== filterKey ||
      typeof dueAt !== 'string' ||
      !Number.isFinite(Date.parse(dueAt)) ||
      typeof id !== 'string' ||
      !productionIdSchema.safeParse(id).success
    )
      return null;
    return {
      dueAt: new Date(dueAt).toISOString(),
      id,
    } satisfies ProductionOrderControlCursor;
  } catch {
    return null;
  }
};

export const stageOrder = (
  stage: ProductionOrderRouteAttempt['stage'],
): number => {
  switch (stage) {
    case 'sorting':
      return 0;
    case 'washing':
      return 1;
    case 'drying':
      return 2;
    case 'folding_packaging':
      return 3;
  }
};
