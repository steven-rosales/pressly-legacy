import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatInstant, instantFromDate } from '@pressly/time';
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  WorkspaceSectionHeading,
} from '@/components/ui';
import { controlErrorMessage } from '@/i18n/control-error-message';
import type { ControlAuthenticatedSession } from '@/authentication/control-session';
import type { ControlCustomerApi } from '@/features/customers/customer-api';
import type { ControlCustomer } from '@/features/customers/customer-model';
import type { ControlOrderApi } from './order-api';
import { OrderForm } from './order-form';
import type {
  ControlOrder,
  ControlOrderDetail,
  ControlOrderPage,
  OrderState,
} from './order-model';

type StateFilter = 'all' | OrderState;
type Drawer = { mode: 'create' } | { mode: 'detail'; orderId: string } | null;

const emptyPage: ControlOrderPage = { items: [], nextCursor: null };

const errorMessage = (
  error: unknown,
  t: TFunction,
  fallback: string,
  conflictMessage: string,
) =>
  controlErrorMessage(error, t, fallback, {
    conflict: conflictMessage,
  });

const customerLine = (order: ControlOrder, unresolvedCustomer: string) =>
  [
    order.customer.displayName ?? unresolvedCustomer,
    order.customer.phone ?? order.customer.email,
  ]
    .filter(Boolean)
    .join(' · ');

const money = (
  locale: 'en-US' | 'es-US',
  currency: string,
  cents: number | null,
  notRecorded: string,
) =>
  cents === null
    ? notRecorded
    : new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(cents / 100);

export function OrderWorkspace({
  api,
  customersApi,
  session,
}: {
  api: ControlOrderApi;
  customersApi: ControlCustomerApi;
  session: ControlAuthenticatedSession;
}) {
  const { t, i18n } = useTranslation();
  const locale: 'en-US' | 'es-US' =
    i18n.resolvedLanguage?.startsWith('es') === true ? 'es-US' : 'en-US';
  const stateLabel: Readonly<Record<OrderState, string>> = {
    open: t('orders.states.open'),
    completed: t('orders.states.completed'),
    canceled: t('orders.states.canceled'),
  };
  const orderTitle = (order: ControlOrder) =>
    t('orders.orderTitle', {
      number: order.displayNumber ?? order.id.slice(0, 8).toUpperCase(),
    });
  const orderCustomerLine = (order: ControlOrder) =>
    customerLine(order, t('orders.customerNotResolved'));
  const formatMoney = (currency: string, cents: number | null) =>
    money(locale, currency, cents, t('orders.common.notRecorded'));
  const canWrite = session.access.capabilities.includes('orders:write');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('open');
  const [locationId, setLocationId] = useState<string | null>(
    session.access.selectedLocationId,
  );
  const [cursorStack, setCursorStack] = useState<readonly (string | null)[]>([
    null,
  ]);
  const cursor = cursorStack.at(-1) ?? null;
  const [page, setPage] = useState<ControlOrderPage>(emptyPage);
  const [customers, setCustomers] = useState<readonly ControlCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [detail, setDetail] = useState<ControlOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        api.list({
          query,
          state: stateFilter === 'all' ? null : stateFilter,
          locationId,
          cursor,
        }),
        customersApi.list({
          query: '',
          active: true,
          cursor: null,
          limit: 100,
        }),
      ])
        .then(([ordersPage, customerPage]) => {
          setPage(ordersPage);
          setCustomers(customerPage.items);
          setListError(null);
        })
        .catch((error: unknown) => {
          setListError(
            errorMessage(
              error,
              t,
              t('orders.errors.loadList'),
              t('orders.errors.conflict'),
            ),
          );
        })
        .finally(() => setLoading(false)),
    [api, cursor, customersApi, locationId, query, stateFilter, t],
  );

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    if (drawer?.mode !== 'detail') return;
    let active = true;

    void api
      .get(drawer.orderId)
      .then((order) => {
        if (active) setDetail(order);
      })
      .catch((error: unknown) => {
        if (active)
          setWriteError(
            errorMessage(
              error,
              t,
              t('orders.errors.loadDetail'),
              t('orders.errors.conflict'),
            ),
          );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, drawer, t]);

  const resetPaging = () => setCursorStack([null]);
  const closeDrawer = () => {
    if (writeBusy) return;
    setDrawer(null);
    setDetail(null);
    setWriteError(null);
  };

  const openCreate = () => {
    setDetail(null);
    setWriteError(null);
    setDrawer({ mode: 'create' });
  };

  const openDetail = (orderId: string) => {
    setDetail(null);
    setDetailLoading(true);
    setWriteError(null);
    setDrawer({ mode: 'detail', orderId });
  };

  const refresh = () => {
    setLoading(true);
    setListError(null);
    setRefreshVersion((current) => current + 1);
  };

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetPaging();
    setQuery(searchDraft.trim());
  };

  const submitOrder: React.ComponentProps<
    typeof OrderForm
  >['onSubmit'] = async (submission) => {
    setWriteBusy(true);
    setWriteError(null);
    try {
      if (submission.mode === 'create') await api.create(submission.value);
      else await api.correct(submission.value);
      setDrawer(null);
      resetPaging();
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setWriteError(
        errorMessage(
          error,
          t,
          t('orders.errors.save'),
          t('orders.errors.conflict'),
        ),
      );
    } finally {
      setWriteBusy(false);
    }
  };

  const searchCustomers = async (customerQuery: string) => {
    const customerPage = await customersApi.list({
      query: customerQuery,
      active: true,
      cursor: null,
      limit: 100,
    });
    return customerPage.items;
  };

  const timezoneFor = (order: ControlOrder) =>
    session.access.locations.find(
      ({ id }) => id === order.fulfillment.locationId,
    )?.timezone ?? 'America/New_York';

  const locationName = (order: ControlOrder) =>
    session.access.locations.find(
      ({ id }) => id === order.fulfillment.locationId,
    )?.name ?? t('orders.assignedLocation');

  const dueLabel = (order: ControlOrder) =>
    formatInstant(timezoneFor(order), instantFromDate(new Date(order.dueAt)), {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      locale,
    });

  const weightLabel = (order: ControlOrder) =>
    order.fulfillment.estimatedWeightLbs === null
      ? t('orders.weight.notEstimated')
      : t('orders.weight.estimated', {
          value: order.fulfillment.estimatedWeightLbs,
        });

  const balanceLabel = (order: ControlOrder) =>
    order.balanceDueCents === null
      ? t('orders.balance.notRecorded')
      : t('orders.balance.due', {
          amount: formatMoney(order.currency, order.balanceDueCents),
        });

  const reviewLabel = (order: ControlOrder) =>
    t('orders.actions.reviewOrder', {
      order: orderTitle(order),
      customer: order.customer.displayName ?? t('orders.customerNotResolved'),
    });

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="commercial-orders-title"
    >
      <WorkspaceSectionHeading
        titleId="commercial-orders-title"
        title={t('orders.workspace.title')}
        description={t('orders.workspace.description')}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-8"
              onClick={refresh}
              disabled={loading}
            >
              <IconRefresh data-icon="inline-start" />
              {t('orders.actions.refresh')}
            </Button>
            {canWrite && (
              <Button
                type="button"
                className="h-11 sm:h-8"
                onClick={openCreate}
                disabled={customers.length === 0}
              >
                <IconPlus data-icon="inline-start" />
                {t('orders.actions.new')}
              </Button>
            )}
          </div>
        }
      />

      {canWrite && !loading && customers.length === 0 && (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>{t('orders.customerRequired.title')}</AlertTitle>
          <AlertDescription>
            {t('orders.customerRequired.description')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form
            className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_11rem_13rem] xl:items-end"
            onSubmit={applySearch}
          >
            <Field className="xl:max-w-xl">
              <FieldLabel htmlFor="order-search">
                {t('orders.search.label')}
              </FieldLabel>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="relative flex-1">
                  <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="order-search"
                    className="h-11 pl-9"
                    placeholder={t('orders.search.placeholder')}
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                  />
                </div>
                <Button type="submit" variant="outline" className="h-11">
                  {t('orders.actions.search')}
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="order-state-filter">
                {t('orders.filters.stateLabel')}
              </FieldLabel>
              <Select
                value={stateFilter}
                onValueChange={(next: StateFilter) => {
                  setStateFilter(next);
                  resetPaging();
                }}
              >
                <SelectTrigger id="order-state-filter" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="open">
                      {t('orders.filters.open')}
                    </SelectItem>
                    <SelectItem value="completed">
                      {t('orders.filters.completed')}
                    </SelectItem>
                    <SelectItem value="canceled">
                      {t('orders.filters.canceled')}
                    </SelectItem>
                    <SelectItem value="all">
                      {t('orders.filters.allStates')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="order-location-filter">
                {t('orders.form.location')}
              </FieldLabel>
              <Select
                value={locationId ?? 'all'}
                onValueChange={(next) => {
                  setLocationId(next === 'all' ? null : next);
                  resetPaging();
                }}
              >
                <SelectTrigger
                  id="order-location-filter"
                  className="h-11 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t('orders.filters.allLocations')}
                    </SelectItem>
                    {session.access.locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </form>
        </CardContent>
      </Card>

      {listError !== null && (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>{t('orders.errors.listTitle')}</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('orders.list.title')}</CardTitle>
          <CardDescription>
            {query.length > 0
              ? t('orders.list.showingMatches', { query })
              : t('orders.list.description')}
          </CardDescription>
        </CardHeader>
        {loading && page.items.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>{t('orders.loading.listTitle')}</EmptyTitle>
              <EmptyDescription>
                {t('orders.loading.listDescription')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : page.items.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconPackage />
              </EmptyMedia>
              <EmptyTitle>{t('orders.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('orders.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
            {canWrite && customers.length > 0 && (
              <EmptyContent>
                <Button onClick={openCreate}>
                  <IconPlus data-icon="inline-start" />
                  {t('orders.actions.new')}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <>
            <div
              className="hidden md:block"
              data-slot="control-order-desktop-list"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('orders.table.orderCustomer')}</TableHead>
                    <TableHead>{t('orders.filters.stateLabel')}</TableHead>
                    <TableHead>{t('orders.table.due')}</TableHead>
                    <TableHead>{t('orders.table.fulfillment')}</TableHead>
                    <TableHead>{t('orders.table.amount')}</TableHead>
                    <TableHead>{t('orders.table.review')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.items.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{orderTitle(order)}</div>
                        <div className="text-muted-foreground max-w-72 truncate text-xs">
                          {orderCustomerLine(order)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            order.state === 'open' ? 'secondary' : 'outline'
                          }
                        >
                          {stateLabel[order.state]}
                        </Badge>
                      </TableCell>
                      <TableCell>{dueLabel(order)}</TableCell>
                      <TableCell>
                        <div>{locationName(order)}</div>
                        <div className="text-muted-foreground text-xs">
                          {weightLabel(order)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {formatMoney(order.currency, order.totalAmountCents)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {balanceLabel(order)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={reviewLabel(order)}
                          onClick={() => openDetail(order.id)}
                        >
                          {t('orders.actions.review')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div
              className="grid gap-3 p-3 md:hidden"
              data-slot="control-order-mobile-list"
            >
              {page.items.map((order) => (
                <article
                  key={order.id}
                  className="bg-background flex flex-col gap-4 rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">
                        {orderTitle(order)}
                      </h3>
                      <p className="text-muted-foreground truncate text-xs">
                        {orderCustomerLine(order)}
                      </p>
                    </div>
                    <Badge
                      className="shrink-0"
                      variant={order.state === 'open' ? 'secondary' : 'outline'}
                    >
                      {stateLabel[order.state]}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        {t('orders.table.due')}
                      </dt>
                      <dd className="mt-0.5 font-medium">{dueLabel(order)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        {t('orders.table.amount')}
                      </dt>
                      <dd className="mt-0.5 font-medium">
                        {formatMoney(order.currency, order.totalAmountCents)}
                      </dd>
                      <dd className="text-muted-foreground text-xs">
                        {balanceLabel(order)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground text-xs">
                        {t('orders.table.fulfillment')}
                      </dt>
                      <dd className="mt-0.5 font-medium">
                        {locationName(order)}
                      </dd>
                      <dd className="text-muted-foreground text-xs">
                        {weightLabel(order)}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    aria-label={reviewLabel(order)}
                    onClick={() => openDetail(order.id)}
                  >
                    {t('orders.actions.review')}
                  </Button>
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                {t('orders.pagination.page', { page: cursorStack.length })}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-7"
                  disabled={cursorStack.length === 1 || loading}
                  onClick={() =>
                    setCursorStack((current) => current.slice(0, -1))
                  }
                >
                  <IconChevronLeft data-icon="inline-start" />
                  {t('orders.actions.previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-7"
                  disabled={page.nextCursor === null || loading}
                  onClick={() => {
                    if (page.nextCursor !== null)
                      setCursorStack((current) => [
                        ...current,
                        page.nextCursor,
                      ]);
                  }}
                >
                  {t('orders.actions.next')}
                  <IconChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Sheet
        open={drawer !== null}
        onOpenChange={(open) => !open && closeDrawer()}
      >
        <SheetContent size="workspace">
          {drawer?.mode === 'create' ? (
            <>
              <SheetHeader>
                <SheetTitle>{t('orders.create.title')}</SheetTitle>
                <SheetDescription>
                  {t('orders.create.description')}
                </SheetDescription>
              </SheetHeader>
              <OrderForm
                key="new-order"
                order={null}
                customers={customers}
                onSearchCustomers={searchCustomers}
                session={session}
                busy={writeBusy}
                error={writeError}
                onSubmit={submitOrder}
                onCancel={closeDrawer}
              />
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detail === null
                    ? t('orders.detail.fallbackTitle')
                    : orderTitle(detail)}
                </SheetTitle>
                <SheetDescription>
                  {canWrite
                    ? t('orders.detail.editDescription')
                    : t('orders.detail.readDescription')}
                </SheetDescription>
              </SheetHeader>
              {detailLoading ? (
                <Empty className="flex-1">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Spinner />
                    </EmptyMedia>
                    <EmptyTitle>{t('orders.loading.detailTitle')}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : detail === null ? (
                <div className="px-4">
                  <Alert variant="destructive">
                    <AlertTitle>{t('orders.errors.openTitle')}</AlertTitle>
                    <AlertDescription>
                      {writeError ?? t('orders.errors.openDescription')}
                    </AlertDescription>
                  </Alert>
                </div>
              ) : canWrite ? (
                <>
                  {detail.state !== 'open' && (
                    <Alert className="mx-4">
                      <IconAlertTriangle />
                      <AlertTitle>
                        {t('orders.lifecycleNotice.title', {
                          state:
                            stateLabel[detail.state].toLocaleLowerCase(locale),
                        })}
                      </AlertTitle>
                      <AlertDescription>
                        {t('orders.lifecycleNotice.description')}
                      </AlertDescription>
                    </Alert>
                  )}
                  <OrderForm
                    key={detail.id}
                    order={detail}
                    customers={customers}
                    onSearchCustomers={searchCustomers}
                    session={session}
                    busy={writeBusy}
                    error={writeError}
                    onSubmit={submitOrder}
                    onCancel={closeDrawer}
                  />
                </>
              ) : (
                <OrderReadOnly order={detail} session={session} />
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function OrderReadOnly({
  order,
  session,
}: {
  order: ControlOrderDetail;
  session: ControlAuthenticatedSession;
}) {
  const { t, i18n } = useTranslation();
  const locale: 'en-US' | 'es-US' =
    i18n.resolvedLanguage?.startsWith('es') === true ? 'es-US' : 'en-US';
  const state = t(`orders.states.${order.state}`);
  const notRecorded = t('orders.common.notRecorded');
  const location = session.access.locations.find(
    ({ id }) => id === order.fulfillment.locationId,
  );
  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <OrderDatum
          label={t('orders.form.customer')}
          value={customerLine(order, t('orders.customerNotResolved'))}
        />
        <OrderDatum label={t('orders.filters.stateLabel')} value={state} />
        <OrderDatum
          label={t('orders.form.location')}
          value={location?.name ?? t('orders.assignedLocation')}
        />
        <OrderDatum
          label={t('orders.form.orderTotal')}
          value={money(
            locale,
            order.currency,
            order.totalAmountCents,
            notRecorded,
          )}
        />
        <OrderDatum
          label={t('orders.form.balanceDue')}
          value={money(
            locale,
            order.currency,
            order.balanceDueCents,
            notRecorded,
          )}
        />
        <OrderDatum
          label={t('orders.form.estimatedWeight')}
          value={
            order.fulfillment.estimatedWeightLbs === null
              ? t('orders.weight.notEstimatedShort')
              : t('orders.weight.value', {
                  value: order.fulfillment.estimatedWeightLbs,
                })
          }
        />
      </dl>
    </div>
  );
}

function OrderDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
