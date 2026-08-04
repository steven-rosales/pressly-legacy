import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  IconAddressBook,
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
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
import type { ControlCustomerApi } from './customer-api';
import { CustomerForm } from './customer-form';
import type {
  ControlCustomer,
  ControlCustomerPage,
  CustomerProfile,
} from './customer-model';

type CustomerStatusFilter = 'all' | 'active' | 'inactive';
type Drawer =
  | { mode: 'create' }
  | { mode: 'detail'; customerId: string }
  | null;

const emptyPage: ControlCustomerPage = { items: [], nextCursor: null };

const errorMessage = (
  error: unknown,
  t: TFunction,
  fallback: string,
  conflictMessage: string,
) =>
  controlErrorMessage(error, t, fallback, {
    conflict: conflictMessage,
  });

const contactLine = (customer: ControlCustomer, missingContact: string) =>
  [customer.phone, customer.email].filter(Boolean).join(' · ') ||
  missingContact;

export function CustomerWorkspace({
  api,
  session,
}: {
  api: ControlCustomerApi;
  session: ControlAuthenticatedSession;
}) {
  const { t } = useTranslation();
  const canWrite = session.access.capabilities.includes('customers:write');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('active');
  const [cursorStack, setCursorStack] = useState<readonly (string | null)[]>([
    null,
  ]);
  const cursor = cursorStack.at(-1) ?? null;
  const [page, setPage] = useState<ControlCustomerPage>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [detail, setDetail] = useState<ControlCustomer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .list({
          query,
          active: status === 'all' ? null : status === 'active',
          cursor,
        })
        .then((next) => {
          setPage(next);
          setListError(null);
        })
        .catch((error: unknown) => {
          setListError(
            errorMessage(
              error,
              t,
              t('customers.errors.loadList'),
              t('customers.errors.conflict'),
            ),
          );
        })
        .finally(() => setLoading(false)),
    [api, cursor, query, status, t],
  );

  useEffect(() => {
    void load();
  }, [load, refreshVersion]);

  useEffect(() => {
    if (drawer?.mode !== 'detail') return;
    let active = true;
    void api
      .get(drawer.customerId)
      .then((customer) => {
        if (active) setDetail(customer);
      })
      .catch((error: unknown) => {
        if (active)
          setWriteError(
            errorMessage(
              error,
              t,
              t('customers.errors.loadDetail'),
              t('customers.errors.conflict'),
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

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetPaging();
    setQuery(searchDraft.trim());
  };

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

  const openDetail = (customerId: string) => {
    setDetail(null);
    setDetailLoading(true);
    setWriteError(null);
    setDrawer({ mode: 'detail', customerId });
  };

  const refresh = () => {
    setLoading(true);
    setListError(null);
    setRefreshVersion((current) => current + 1);
  };

  const create = async (value: CustomerProfile) => {
    setWriteBusy(true);
    setWriteError(null);
    try {
      await api.create(value);
      setDrawer(null);
      resetPaging();
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setWriteError(
        errorMessage(
          error,
          t,
          t('customers.errors.create'),
          t('customers.errors.conflict'),
        ),
      );
    } finally {
      setWriteBusy(false);
    }
  };

  const update = async (value: CustomerProfile & { active?: boolean }) => {
    if (detail === null) return;
    setWriteBusy(true);
    setWriteError(null);
    try {
      await api.update({
        customerId: detail.id,
        expectedVersion: detail.version,
        changes: value,
      });
      setDrawer(null);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setWriteError(
        errorMessage(
          error,
          t,
          t('customers.errors.save'),
          t('customers.errors.conflict'),
        ),
      );
    } finally {
      setWriteBusy(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="customer-records-title"
    >
      <WorkspaceSectionHeading
        titleId="customer-records-title"
        title={t('customers.workspace.title')}
        description={t('customers.workspace.description')}
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
              {t('customers.actions.refresh')}
            </Button>
            {canWrite && (
              <Button
                type="button"
                className="h-11 sm:h-8"
                onClick={openCreate}
              >
                <IconPlus data-icon="inline-start" />
                {t('customers.actions.new')}
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent>
          <form
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-end"
            onSubmit={applySearch}
          >
            <Field className="lg:max-w-xl">
              <FieldLabel htmlFor="customer-search">
                {t('customers.search.label')}
              </FieldLabel>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="relative flex-1">
                  <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="customer-search"
                    className="h-11 pl-9"
                    placeholder={t('customers.search.placeholder')}
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                  />
                </div>
                <Button type="submit" variant="outline" className="h-11">
                  {t('customers.actions.search')}
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-status-filter">
                {t('customers.status.label')}
              </FieldLabel>
              <Select
                value={status}
                onValueChange={(next: CustomerStatusFilter) => {
                  setStatus(next);
                  resetPaging();
                }}
              >
                <SelectTrigger
                  id="customer-status-filter"
                  className="h-11 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">
                      {t('customers.filters.active')}
                    </SelectItem>
                    <SelectItem value="inactive">
                      {t('customers.filters.inactive')}
                    </SelectItem>
                    <SelectItem value="all">
                      {t('customers.filters.all')}
                    </SelectItem>
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
          <AlertTitle>{t('customers.errors.listTitle')}</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('customers.list.title')}</CardTitle>
          <CardDescription>
            {query.length > 0
              ? t('customers.list.showingMatches', { query })
              : t('customers.list.description')}
          </CardDescription>
        </CardHeader>
        {loading && page.items.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>{t('customers.loading.listTitle')}</EmptyTitle>
              <EmptyDescription>
                {t('customers.loading.listDescription')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : page.items.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconAddressBook />
              </EmptyMedia>
              <EmptyTitle>{t('customers.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('customers.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
            {canWrite && (
              <EmptyContent>
                <Button onClick={openCreate}>
                  <IconPlus data-icon="inline-start" />
                  {t('customers.actions.new')}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <>
            <div
              className="hidden md:block"
              data-slot="control-customer-desktop-list"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('customers.table.customer')}</TableHead>
                    <TableHead>{t('customers.table.contact')}</TableHead>
                    <TableHead>{t('customers.table.status')}</TableHead>
                    <TableHead>{t('customers.table.review')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.items.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="font-medium">
                          {customer.displayName}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {customer.businessName === null
                            ? t('customers.types.individual')
                            : t('customers.types.commercial')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-80 truncate">
                          {contactLine(
                            customer,
                            t('customers.contact.notRecorded'),
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge
                            variant={customer.active ? 'secondary' : 'outline'}
                          >
                            {customer.active
                              ? t('customers.status.active')
                              : t('customers.status.inactive')}
                          </Badge>
                          {customer.possibleDuplicateCount > 0 && (
                            <Badge variant="outline">
                              {t('customers.list.possibleMatch', {
                                count: customer.possibleDuplicateCount,
                              })}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={t('customers.actions.reviewCustomer', {
                            customer: customer.displayName,
                          })}
                          onClick={() => openDetail(customer.id)}
                        >
                          {t('customers.actions.review')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div
              className="grid gap-3 p-3 md:hidden"
              data-slot="control-customer-mobile-list"
            >
              {page.items.map((customer) => (
                <article
                  key={customer.id}
                  className="bg-background flex flex-col gap-4 rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">
                        {customer.displayName}
                      </h3>
                      <p className="text-muted-foreground text-xs">
                        {customer.businessName === null
                          ? t('customers.types.individual')
                          : t('customers.types.commercial')}
                      </p>
                    </div>
                    <Badge
                      className="shrink-0"
                      variant={customer.active ? 'secondary' : 'outline'}
                    >
                      {customer.active
                        ? t('customers.status.active')
                        : t('customers.status.inactive')}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        {t('customers.table.contact')}
                      </dt>
                      <dd className="mt-0.5 font-medium break-words">
                        {contactLine(
                          customer,
                          t('customers.contact.notRecorded'),
                        )}
                      </dd>
                    </div>
                    {customer.possibleDuplicateCount > 0 && (
                      <div>
                        <dt className="sr-only">
                          {t('customers.table.status')}
                        </dt>
                        <dd>
                          <Badge variant="outline">
                            {t('customers.list.possibleMatch', {
                              count: customer.possibleDuplicateCount,
                            })}
                          </Badge>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    aria-label={t('customers.actions.reviewCustomer', {
                      customer: customer.displayName,
                    })}
                    onClick={() => openDetail(customer.id)}
                  >
                    {t('customers.actions.review')}
                  </Button>
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                {t('customers.pagination.page', {
                  page: cursorStack.length,
                })}
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
                  {t('customers.actions.previous')}
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
                  {t('customers.actions.next')}
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
                <SheetTitle>{t('customers.create.title')}</SheetTitle>
                <SheetDescription>
                  {t('customers.create.description')}
                </SheetDescription>
              </SheetHeader>
              <CustomerForm
                key="new-customer"
                customer={null}
                busy={writeBusy}
                error={writeError}
                onSubmit={create}
                onCancel={closeDrawer}
              />
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detail?.displayName ?? t('customers.detail.fallbackTitle')}
                </SheetTitle>
                <SheetDescription>
                  {canWrite
                    ? t('customers.detail.editDescription')
                    : t('customers.detail.readDescription')}
                </SheetDescription>
              </SheetHeader>
              {detailLoading ? (
                <Empty className="flex-1">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Spinner />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t('customers.loading.detailTitle')}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : detail === null ? (
                <div className="px-4">
                  <Alert variant="destructive">
                    <AlertTitle>{t('customers.errors.openTitle')}</AlertTitle>
                    <AlertDescription>
                      {writeError ?? t('customers.errors.openDescription')}
                    </AlertDescription>
                  </Alert>
                </div>
              ) : canWrite ? (
                <>
                  {detail.possibleDuplicateCount > 0 && (
                    <Alert className="mx-4">
                      <IconAlertTriangle />
                      <AlertTitle>{t('customers.duplicate.title')}</AlertTitle>
                      <AlertDescription>
                        {t('customers.duplicate.description', {
                          count: detail.possibleDuplicateCount,
                        })}
                      </AlertDescription>
                    </Alert>
                  )}
                  <CustomerForm
                    key={detail.id}
                    customer={detail}
                    busy={writeBusy}
                    error={writeError}
                    onSubmit={update}
                    onCancel={closeDrawer}
                  />
                </>
              ) : (
                <div className="flex flex-col gap-4 overflow-y-auto px-4">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <CustomerDatum
                      label={t('customers.detail.name')}
                      value={detail.displayName}
                    />
                    <CustomerDatum
                      label={t('customers.status.label')}
                      value={
                        detail.active
                          ? t('customers.status.active')
                          : t('customers.status.inactive')
                      }
                    />
                    <CustomerDatum
                      label={t('customers.form.phone')}
                      value={detail.phone ?? t('customers.contact.notRecorded')}
                    />
                    <CustomerDatum
                      label={t('customers.form.email')}
                      value={detail.email ?? t('customers.contact.notRecorded')}
                    />
                  </dl>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function CustomerDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
