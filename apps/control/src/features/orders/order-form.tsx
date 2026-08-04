import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  instantFromWall,
  toUtcIso,
  wallFromInstant,
  instantFromDate,
} from '@pressly/time';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { ControlAuthenticatedSession } from '@/authentication/control-session';
import type { ControlCustomer } from '@/features/customers/customer-model';
import { controlErrorMessage } from '@/i18n/control-error-message';
import type {
  CorrectControlOrderInput,
  CreateControlOrderInput,
} from './order-api';
import type { ControlOrderDetail } from './order-model';
import { DueDateField } from './due-date-field';

type OrderFormSubmission =
  | { mode: 'create'; value: CreateControlOrderInput }
  | { mode: 'correct'; value: CorrectControlOrderInput };

type OrderFormValue = {
  customerId: string;
  displayNumber: string;
  dueAt: string;
  totalDollars: string;
  balanceDollars: string;
  locationId: string;
  estimatedWeightLbs: string;
  reasonNote: string;
};

const dollars = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toFixed(2);

const cents = (value: string) => {
  if (value.trim().length === 0) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100);
};

const defaultDueAt = (timezone: string) => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const wall = wallFromInstant(timezone, instantFromDate(tomorrow));
  const result = instantFromWall(
    timezone,
    {
      year: wall.year,
      month: wall.month,
      day: wall.day,
      hour: 17,
      minute: 0,
    },
    'earlier',
  );
  return result.tag === 'ok' ? toUtcIso(result.value) : tomorrow.toISOString();
};

const initialValue = (
  order: ControlOrderDetail | null,
  session: ControlAuthenticatedSession,
): OrderFormValue => {
  const locationId =
    order?.fulfillment.locationId ??
    session.access.selectedLocationId ??
    session.access.locations[0]?.id ??
    '';
  const timezone =
    session.access.locations.find(({ id }) => id === locationId)?.timezone ??
    session.access.locations[0]?.timezone ??
    'America/New_York';
  return {
    customerId: order?.customer.userId ?? '',
    displayNumber: order?.displayNumber ?? '',
    dueAt: order?.dueAt ?? defaultDueAt(timezone),
    totalDollars: dollars(order?.totalAmountCents ?? 0),
    balanceDollars: dollars(order?.balanceDueCents ?? 0),
    locationId,
    estimatedWeightLbs: order?.fulfillment.estimatedWeightLbs?.toString() ?? '',
    reasonNote: '',
  };
};

export function OrderForm({
  order,
  customers,
  onSearchCustomers,
  session,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  order: ControlOrderDetail | null;
  customers: readonly ControlCustomer[];
  onSearchCustomers: (query: string) => Promise<readonly ControlCustomer[]>;
  session: ControlAuthenticatedSession;
  busy: boolean;
  error: string | null;
  onSubmit: (submission: OrderFormSubmission) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => initialValue(order, session));
  const [validation, setValidation] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(
    null,
  );
  const currentCustomerOption =
    order?.customer.userId === null || order?.customer.userId === undefined
      ? null
      : {
          id: order.customer.userId,
          displayName: order.customer.displayName ?? '',
          phone: order.customer.phone,
        };
  const initialCustomerOptions = [
    ...(currentCustomerOption === null ? [] : [currentCustomerOption]),
    ...customers,
  ].filter(
    (customerOption, index, all) =>
      all.findIndex(({ id }) => id === customerOption.id) === index,
  );
  const [customerOptions, setCustomerOptions] = useState<
    readonly Pick<ControlCustomer, 'id' | 'displayName' | 'phone'>[]
  >(initialCustomerOptions);
  const location = useMemo(
    () =>
      session.access.locations.find(({ id }) => id === value.locationId) ??
      session.access.locations[0],
    [session.access.locations, value.locationId],
  );

  const update = <Key extends keyof OrderFormValue>(
    key: Key,
    next: OrderFormValue[Key],
  ) => setValue((current) => ({ ...current, [key]: next }));

  const searchCustomers = async () => {
    setCustomerSearchBusy(true);
    setCustomerSearchError(null);
    try {
      const matches = await onSearchCustomers(customerSearch.trim());
      setCustomerOptions(
        [
          ...(currentCustomerOption === null ? [] : [currentCustomerOption]),
          ...matches,
        ].filter(
          (customerOption, index, all) =>
            all.findIndex(({ id }) => id === customerOption.id) === index,
        ),
      );
    } catch (searchError) {
      setCustomerSearchError(
        controlErrorMessage(searchError, t, t('orders.errors.customerSearch')),
      );
    } finally {
      setCustomerSearchBusy(false);
    }
  };

  const customerSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void searchCustomers();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const totalAmountCents = cents(value.totalDollars);
    const balanceDueCents = cents(value.balanceDollars);
    const estimatedWeight =
      value.estimatedWeightLbs.trim().length === 0
        ? null
        : Number(value.estimatedWeightLbs);

    if (value.customerId.length === 0) {
      setValidation(t('orders.validation.customerRequired'));
      return;
    }
    if (value.locationId.length === 0) {
      setValidation(t('orders.validation.locationRequired'));
      return;
    }
    if (
      totalAmountCents === undefined ||
      balanceDueCents === undefined ||
      (estimatedWeight !== null &&
        (!Number.isFinite(estimatedWeight) || estimatedWeight <= 0))
    ) {
      setValidation(t('orders.validation.amountsAndWeight'));
      return;
    }
    if (order !== null && value.reasonNote.trim().length === 0) {
      setValidation(t('orders.validation.correctionReason'));
      return;
    }

    setValidation(null);
    const common = {
      customerId: value.customerId,
      displayNumber:
        value.displayNumber.trim().length === 0
          ? null
          : value.displayNumber.trim(),
      dueAt: value.dueAt,
      totalAmountCents: totalAmountCents ?? 0,
      balanceDueCents,
      estimatedWeightLbs: estimatedWeight,
    };
    void onSubmit(
      order === null
        ? {
            mode: 'create',
            value: { ...common, locationId: value.locationId },
          }
        : {
            mode: 'correct',
            value: {
              ...common,
              order,
              reasonNote: value.reasonNote.trim(),
            },
          },
    );
  };

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        {error !== null && (
          <Alert variant="destructive">
            <AlertTitle>{t('orders.form.saveErrorTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {validation !== null && <FieldError>{validation}</FieldError>}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="order-customer">
              {t('orders.form.customer')}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                aria-label={t('orders.form.findCustomer')}
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                onKeyDown={customerSearchKeyDown}
                placeholder={t('orders.form.customerSearchPlaceholder')}
                disabled={busy || customerSearchBusy}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void searchCustomers()}
                disabled={busy || customerSearchBusy}
              >
                {customerSearchBusy
                  ? t('orders.actions.searching')
                  : t('orders.actions.find')}
              </Button>
            </div>
            <Select
              value={value.customerId}
              onValueChange={(next) => update('customerId', next)}
              disabled={busy}
            >
              <SelectTrigger id="order-customer" className="w-full">
                <SelectValue
                  placeholder={t('orders.form.selectExactCustomer')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {customerOptions.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.displayName.length === 0
                        ? t('orders.form.currentCustomer')
                        : customer.displayName}
                      {customer.phone === null ? '' : ` · ${customer.phone}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {t('orders.form.customerDescription')}
            </FieldDescription>
            {customerSearchError !== null && (
              <FieldError>{customerSearchError}</FieldError>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="order-display-number">
                {t('orders.form.orderNumber')}
              </FieldLabel>
              <Input
                id="order-display-number"
                value={value.displayNumber}
                onChange={(event) =>
                  update('displayNumber', event.target.value)
                }
                placeholder={t('orders.common.optional')}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-location">
                {t('orders.form.location')}
              </FieldLabel>
              <Select
                value={value.locationId}
                onValueChange={(next) => update('locationId', next)}
                disabled={busy || order !== null}
              >
                <SelectTrigger id="order-location" className="w-full">
                  <SelectValue placeholder={t('orders.form.selectLocation')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {session.access.locations.map((availableLocation) => (
                      <SelectItem
                        key={availableLocation.id}
                        value={availableLocation.id}
                      >
                        {availableLocation.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {order !== null && (
                <FieldDescription>
                  {t('orders.form.locationLockedDescription')}
                </FieldDescription>
              )}
            </Field>
          </div>

          <DueDateField
            value={value.dueAt}
            timezone={location?.timezone ?? 'America/New_York'}
            onChange={(next) => update('dueAt', next)}
            disabled={busy}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="order-total">
                {t('orders.form.orderTotal')}
              </FieldLabel>
              <Input
                id="order-total"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={value.totalDollars}
                onChange={(event) => update('totalDollars', event.target.value)}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-balance">
                {t('orders.form.balanceDue')}
              </FieldLabel>
              <Input
                id="order-balance"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={value.balanceDollars}
                onChange={(event) =>
                  update('balanceDollars', event.target.value)
                }
                placeholder={t('orders.common.notRecorded')}
                disabled={busy}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="order-estimated-weight">
              {t('orders.form.estimatedWeight')}
            </FieldLabel>
            <Input
              id="order-estimated-weight"
              type="number"
              min="0.1"
              step="0.1"
              inputMode="decimal"
              value={value.estimatedWeightLbs}
              onChange={(event) =>
                update('estimatedWeightLbs', event.target.value)
              }
              placeholder={t('orders.form.optionalPounds')}
              disabled={busy}
            />
            <FieldDescription>
              {t('orders.form.weightDescription')}
            </FieldDescription>
          </Field>

          {order !== null && (
            <Field>
              <FieldLabel htmlFor="order-correction-reason">
                {t('orders.form.correctionNote')}
              </FieldLabel>
              <Input
                id="order-correction-reason"
                value={value.reasonNote}
                onChange={(event) => update('reasonNote', event.target.value)}
                placeholder={t('orders.form.correctionPlaceholder')}
                required
                disabled={busy}
              />
              <FieldDescription>
                {t('orders.form.correctionDescription')}
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </div>
      <div className="border-t p-4">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            {t('orders.actions.cancel')}
          </Button>
          <Button type="submit" disabled={busy || customerOptions.length === 0}>
            {busy
              ? t('orders.actions.saving')
              : order === null
                ? t('orders.actions.create')
                : t('orders.actions.saveCorrection')}
          </Button>
        </div>
      </div>
    </form>
  );
}
