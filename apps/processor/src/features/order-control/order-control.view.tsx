import {
  IconAlertTriangle,
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconFilter,
  IconPackage,
  IconSearch,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SectionHeading } from '@/components/layout/workspace-primitives';
import { OperationalOrderIdentity } from '@/components/orders/operational-order-identity';
import { DelayedLoadingRows } from '@/components/ui/delayed-loading-rows';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/components/ui/class-names';
import { OrderDetailSheet } from './order-detail-sheet.view';
import type {
  CursorPageViewModel,
  OrderControlCallbacks,
  OrderControlFilterOption,
  OrderControlFilters,
  OrderControlOrder,
  OrderControlTab,
  OrderControlViewModel,
} from './order-control.model';

const tabCopy: ReadonlyArray<
  Readonly<{
    value: OrderControlTab;
    labelKey:
      | 'orderControl.needsAttention'
      | 'orderControl.active'
      | 'orderControl.all';
    compactLabelKey:
      | 'orderControl.attention'
      | 'orderControl.active'
      | 'orderControl.all';
    count: (model: OrderControlViewModel) => number;
  }>
> = [
  {
    value: 'needs_attention',
    labelKey: 'orderControl.needsAttention',
    compactLabelKey: 'orderControl.attention',
    count: (model) => model.counts.needsAttention,
  },
  {
    value: 'active',
    labelKey: 'orderControl.active',
    compactLabelKey: 'orderControl.active',
    count: (model) => model.counts.active,
  },
  {
    value: 'all',
    labelKey: 'orderControl.all',
    compactLabelKey: 'orderControl.all',
    count: (model) => model.counts.all,
  },
];

const defaultFilterValue = (value: string) =>
  value === '' || value === 'all' || value === 'any';

const activeFilterCount = (filters: OrderControlFilters) =>
  [filters.status, filters.due, filters.stage, filters.priority].filter(
    (value) => !defaultFilterValue(value),
  ).length + (filters.query.trim().length > 0 ? 1 : 0);

function FilterSelect<TValue extends string>({
  id,
  label,
  value,
  options,
  onValueChange,
}: Readonly<{
  id: string;
  label: string;
  value: TValue;
  options: readonly OrderControlFilterOption<TValue>[];
  onValueChange: (value: TValue) => void;
}>) {
  return (
    <NativeSelect
      id={id}
      aria-label={label}
      className="min-w-36 flex-1 sm:flex-none [&_[data-slot=native-select]]:h-11"
      value={value}
      onChange={(event) => onValueChange(event.target.value as TValue)}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function AttentionBadge({ order }: { order: OrderControlOrder }) {
  if (order.attention === null)
    return <Badge variant="secondary">{order.statusLabel}</Badge>;
  return (
    <Badge
      variant={order.attention.tone === 'critical' ? 'destructive' : 'outline'}
      className={cn(
        order.attention.tone === 'warning' &&
          'border-warning-foreground/30 bg-warning text-warning-foreground',
      )}
    >
      {order.attention.label}
    </Badge>
  );
}

function PositionCell({ order }: { order: OrderControlOrder }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{order.position.label}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {order.position.detail}
      </p>
    </div>
  );
}

function DesktopOrderTable({
  orders,
  onOpenOrder,
}: Readonly<{
  orders: readonly OrderControlOrder[];
  onOpenOrder: (orderId: string) => void;
}>) {
  const { t } = useTranslation();
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-background md:block">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[24%] px-4">
              {t('orderControl.order')}
            </TableHead>
            <TableHead>{t('orderControl.state')}</TableHead>
            <TableHead>{t('orderControl.due')}</TableHead>
            <TableHead className="w-[24%]">
              {t('orderControl.floorPosition')}
            </TableHead>
            <TableHead>{t('orderControl.demand')}</TableHead>
            <TableHead>
              <span className="sr-only">
                {t('orderControl.openOrderShort')}
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="px-4 py-3 whitespace-normal">
                <OperationalOrderIdentity
                  identity={order.identity}
                  onPrimaryClick={() => onOpenOrder(order.id)}
                />
              </TableCell>
              <TableCell className="py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <AttentionBadge order={order} />
                  {order.priority && (
                    <Badge>{t('orderControl.priority')}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-3">
                <p className="text-sm font-medium">{order.dueLabel}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {order.dueDetail}
                </p>
              </TableCell>
              <TableCell className="py-3 whitespace-normal">
                <PositionCell order={order} />
              </TableCell>
              <TableCell className="py-3">
                <p className="text-sm font-medium tabular-nums">
                  {order.weightLabel}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {order.bagLabel}
                </p>
              </TableCell>
              <TableCell className="py-3 text-right">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-11"
                  aria-label={t('orderControl.openOrder', {
                    orderId: order.externalOrderId,
                  })}
                  onClick={() => onOpenOrder(order.id)}
                >
                  <IconChevronRight />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileOrderCards({
  orders,
  onOpenOrder,
}: Readonly<{
  orders: readonly OrderControlOrder[];
  onOpenOrder: (orderId: string) => void;
}>) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 md:hidden">
      {orders.map((order) => (
        <Card key={order.id} className="gap-3 bg-background py-4">
          <CardContent className="flex flex-col gap-3 px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <OperationalOrderIdentity
                  identity={order.identity}
                  secondaryClassName="text-sm"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  {order.dueLabel} · {order.weightLabel} · {order.bagLabel}
                </p>
              </div>
              {order.priority && <Badge>{t('orderControl.priority')}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AttentionBadge order={order} />
              <Badge variant="outline">{order.position.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {order.position.detail}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => onOpenOrder(order.id)}
            >
              {t('orderControl.openOrderShort')}
              <IconChevronRight data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrderPagination({
  page,
  onPreviousPage,
  onNextPage,
}: Readonly<{
  page: CursorPageViewModel;
  onPreviousPage: (cursor: string) => void;
  onNextPage: (cursor: string) => void;
}>) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('orderControl.pages')}
      className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-muted-foreground">{page.rangeLabel}</p>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={page.previousCursor === null}
          onClick={() => {
            if (page.previousCursor !== null)
              onPreviousPage(page.previousCursor);
          }}
        >
          <IconChevronLeft data-icon="inline-start" />
          {t('common.previous')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={page.nextCursor === null}
          onClick={() => {
            if (page.nextCursor !== null) onNextPage(page.nextCursor);
          }}
        >
          {t('common.next')}
          <IconChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}

export function OrderAttentionSummary({
  model,
  onOpenOrders,
}: Readonly<{
  model: OrderControlViewModel;
  onOpenOrders: () => void;
}>) {
  const { t } = useTranslation();
  const attentionOrders = model.orders.slice(0, 3);
  const count = model.counts.needsAttention;
  const attentionAvailable = !model.loading && model.error === null;

  return (
    <Card
      size="sm"
      className="bg-background"
      role="region"
      aria-label={t('orderControl.summaryTitle')}
      aria-busy={model.loading || model.refreshing}
      data-testid="order-attention-summary"
    >
      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-3 lg:w-64 lg:shrink-0">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"
            aria-hidden="true"
          >
            <IconPackage className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{t('orderControl.summaryTitle')}</p>
              {attentionAvailable && (
                <Badge variant={count > 0 ? 'secondary' : 'outline'}>
                  {count}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {model.loading
                ? t('orderControl.summaryLoading')
                : model.error !== null
                  ? t('orderControl.summaryUnavailable')
                  : count > 0
                    ? t('orderControl.summaryNeedsAttention', { count })
                    : t('orderControl.summaryClear')}
            </p>
          </div>
        </div>

        {model.loading ? (
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : attentionOrders.length > 0 ? (
          <ul className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
            {attentionOrders.map((order) => (
              <li
                key={order.id}
                className="min-w-0 rounded-lg bg-muted/60 px-3 py-2"
              >
                <OperationalOrderIdentity identity={order.identity} />
                {order.attention !== null && (
                  <p className="mt-1 text-xs break-words text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      {order.attention.label}
                    </span>
                    <span aria-hidden="true"> · </span>
                    {order.dueLabel}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          onClick={onOpenOrders}
        >
          {t('orderControl.openOrders')}
          <IconArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function OrderControlWorkspace({
  model,
  callbacks,
  isMobile,
}: Readonly<{
  model: OrderControlViewModel;
  callbacks: OrderControlCallbacks;
  isMobile: boolean;
}>) {
  const { t } = useTranslation();
  const filterCount = activeFilterCount(model.filters);
  const updateFilter = <TKey extends keyof OrderControlFilters>(
    key: TKey,
    value: OrderControlFilters[TKey],
  ) => callbacks.onFiltersChange({ ...model.filters, [key]: value });

  return (
    <div
      className="flex flex-col gap-6"
      aria-busy={model.loading || model.refreshing}
    >
      <SectionHeading
        title={t('orderControl.title')}
        description={t('orderControl.description', {
          asOf: model.asOfLabel,
        })}
        action={
          model.refreshing ? (
            <div
              role="status"
              className="flex h-8 items-center gap-2 text-xs text-muted-foreground"
            >
              <Spinner className="size-3.5" aria-hidden="true" />
              {t('orderControl.updating')}
            </div>
          ) : undefined
        }
      />

      {model.error !== null && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t('orderControl.ordersNeedAttention')}</AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={model.tab}
        onValueChange={(value) =>
          callbacks.onTabChange(value as OrderControlTab)
        }
      >
        <TabsList className="grid h-11 w-full grid-cols-3 sm:w-fit sm:min-w-md">
          {tabCopy.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              aria-label={t('orderControl.tabLabel', {
                label: t(tab.labelKey),
                count: tab.count(model),
              })}
              className="min-w-0 gap-1 px-1 sm:px-2"
            >
              <span className="sm:hidden">{t(tab.compactLabelKey)}</span>
              <span className="hidden sm:inline">{t(tab.labelKey)}</span>
              <Badge
                variant={model.tab === tab.value ? 'secondary' : 'outline'}
                className="min-w-5 shrink-0 px-1"
              >
                {tab.count(model)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="gap-4 bg-background py-4">
        <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center">
          <InputGroup className="h-11 min-w-0 flex-1 lg:max-w-md">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={t('orderControl.search')}
              placeholder={t('orderControl.searchPlaceholder')}
              value={model.filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
            />
          </InputGroup>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              id="order-status-filter"
              label={t('orderControl.orderStatus')}
              value={model.filters.status}
              options={model.filterOptions.statuses}
              onValueChange={(value) => updateFilter('status', value)}
            />
            <FilterSelect
              id="order-due-filter"
              label={t('orderControl.dueWindow')}
              value={model.filters.due}
              options={model.filterOptions.dueWindows}
              onValueChange={(value) => updateFilter('due', value)}
            />
            <FilterSelect
              id="order-stage-filter"
              label={t('orderControl.floorStage')}
              value={model.filters.stage}
              options={model.filterOptions.stages}
              onValueChange={(value) => updateFilter('stage', value)}
            />
            <FilterSelect
              id="order-priority-filter"
              label={t('orderControl.priority')}
              value={model.filters.priority}
              options={model.filterOptions.priorities}
              onValueChange={(value) => updateFilter('priority', value)}
            />
            {filterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={callbacks.onClearFilters}
              >
                <IconFilter data-icon="inline-start" />
                {t('orderControl.clearCount', { count: filterCount })}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {model.loading ? (
        <DelayedLoadingRows label={t('orderControl.loading')} />
      ) : model.orders.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {model.tab === 'needs_attention' ? (
                <IconCircleCheck />
              ) : (
                <IconPackage />
              )}
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={2}>
              {model.tab === 'needs_attention'
                ? t('orderControl.noAttention')
                : t('orderControl.noMatch')}
            </EmptyTitle>
            <EmptyDescription>
              {filterCount > 0
                ? t('orderControl.emptyFiltered')
                : t('orderControl.empty')}
            </EmptyDescription>
          </EmptyHeader>
          {filterCount > 0 && (
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={callbacks.onClearFilters}
              >
                {t('orderControl.clearFilters')}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <DesktopOrderTable
            orders={model.orders}
            onOpenOrder={callbacks.onOpenOrder}
          />
          <MobileOrderCards
            orders={model.orders}
            onOpenOrder={callbacks.onOpenOrder}
          />
          <OrderPagination
            page={model.page}
            onPreviousPage={callbacks.onPreviousPage}
            onNextPage={callbacks.onNextPage}
          />
        </>
      )}

      <OrderDetailSheet
        order={model.selectedOrder}
        action={model.detailAction}
        callbacks={callbacks}
        isMobile={isMobile}
      />
    </div>
  );
}

export type {
  OrderControlCallbacks,
  OrderControlFilters,
  OrderControlOrder,
  OrderControlViewModel,
} from './order-control.model';
