import { IconCircleCheck, IconPackageImport } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { ProcessorOrderControlItem } from '@pressly/contracts/processor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  presentIntakeCustomer,
  presentIntakeDueBucket,
  presentIntakeOrderNumber,
  presentIntakeSource,
} from './intake.presenter';

type IntakeQueueProps = Readonly<{
  items: readonly ProcessorOrderControlItem[];
  bagCounts: Readonly<Record<string, string>>;
  priorities: Readonly<Record<string, boolean>>;
  busyOrderId: string | null;
  onBagCountChange: (orderId: string, value: string) => void;
  onPriorityChange: (orderId: string, value: boolean) => void;
  onRecord: (item: ProcessorOrderControlItem) => Promise<void>;
  onDecision: (item: ProcessorOrderControlItem, target: 'released') => void;
}>;

type IntakeRowState = Readonly<{
  value: string;
  priority: boolean;
  invalid: boolean;
  canRecord: boolean;
  busy: boolean;
  disabled: boolean;
  hasIntakeChanges: boolean;
}>;

const rowStateFor = (
  item: ProcessorOrderControlItem,
  props: IntakeQueueProps,
): IntakeRowState => {
  const order = item.order;
  const value = props.bagCounts[order.id] ?? order.bagCount?.toString() ?? '';
  const priority = props.priorities[order.id] ?? order.priority;
  return {
    value,
    priority,
    invalid:
      value.length > 0 &&
      (!Number.isInteger(Number(value)) || Number(value) < 0),
    canRecord:
      order.status === 'release_pending' || order.status === 'intake_pending',
    busy: props.busyOrderId === order.id,
    disabled: props.busyOrderId !== null,
    hasIntakeChanges:
      value !== (order.bagCount?.toString() ?? '') ||
      priority !== order.priority,
  };
};

function OrderIdentity({
  item,
  priority,
}: Readonly<{ item: ProcessorOrderControlItem; priority: boolean }>) {
  const { t } = useTranslation();
  const orderNumber = presentIntakeOrderNumber(item);
  const customer = presentIntakeCustomer(item, t);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="truncate font-medium">
          {t('intake.order', { orderId: orderNumber })}
        </p>
        {priority && <Badge>{t('intake.priority')}</Badge>}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {customer.name}
        {customer.phone === null ? '' : ` · ${customer.phone}`}
      </p>
    </div>
  );
}

function SourceState({ item }: Readonly<{ item: ProcessorOrderControlItem }>) {
  const { t } = useTranslation();
  const source = presentIntakeSource(item, t);

  return <p className="text-sm text-muted-foreground">{source.label}</p>;
}

function DemandAndDue({ item }: Readonly<{ item: ProcessorOrderControlItem }>) {
  const { t } = useTranslation();
  const order = item.order;
  const due = presentIntakeDueBucket(order.dueBucket, t);

  return (
    <div className="min-w-0">
      <Badge
        variant={order.dueBucket === 'overdue' ? 'destructive' : 'outline'}
      >
        {due}
      </Badge>
      <p className="mt-1.5 text-sm font-medium tabular-nums">
        {t('common.pounds', { value: order.derivedWeightLbs })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('intake.estimatedDemand')}
      </p>
    </div>
  );
}

function IntakeControls({
  item,
  state,
  mobile = false,
  onBagCountChange,
  onPriorityChange,
  onRecord,
}: Readonly<{
  item: ProcessorOrderControlItem;
  state: IntakeRowState;
  mobile?: boolean;
  onBagCountChange: (value: string) => void;
  onPriorityChange: (value: boolean) => void;
  onRecord: () => Promise<void>;
}>) {
  const { t } = useTranslation();
  const orderNumber = presentIntakeOrderNumber(item);
  const bagsId = `bags-${mobile ? 'mobile-' : ''}${item.order.id}`;
  const priorityId = `priority-${mobile ? 'mobile-' : ''}${item.order.id}`;
  const helpId = `bags-help-${mobile ? 'mobile-' : ''}${item.order.id}`;
  const missingBagCount = state.value.length === 0;
  const needsIntake = item.order.status === 'intake_pending';
  const recordDisabled =
    state.disabled ||
    !state.hasIntakeChanges ||
    missingBagCount ||
    state.invalid;
  const helperText = state.invalid
    ? t('intake.invalidBagCount')
    : missingBagCount
      ? needsIntake
        ? t('intake.enterBagCount')
        : t('intake.optionalBagCount')
      : state.hasIntakeChanges
        ? t('intake.unsavedIntake')
        : t('intake.intakeUpToDate');

  return (
    <div className="min-w-0">
      <div
        className={
          mobile
            ? 'grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'
            : 'flex min-w-[16rem] items-end gap-2'
        }
      >
        <div className="min-w-0">
          <Label htmlFor={bagsId} className="mb-1.5 text-xs">
            {t('intake.bagCount')}
          </Label>
          <Input
            id={bagsId}
            className={mobile ? 'h-11 w-full' : 'h-11 w-24'}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={state.value}
            onChange={(event) => onBagCountChange(event.target.value)}
            aria-label={t('intake.bagsForOrder', { orderId: orderNumber })}
            aria-describedby={helpId}
            aria-invalid={state.invalid}
          />
        </div>
        <div
          className={
            mobile
              ? 'flex h-11 items-center justify-between rounded-lg border border-input px-3'
              : undefined
          }
        >
          <Label
            htmlFor={priorityId}
            className={mobile ? 'text-sm' : 'mb-1.5 text-xs'}
          >
            {t('intake.priority')}
          </Label>
          <div
            className={
              mobile ? 'flex items-center' : 'flex h-11 items-center px-1'
            }
          >
            <Switch
              id={priorityId}
              checked={state.priority}
              onCheckedChange={onPriorityChange}
              aria-label={t('intake.priorityForOrder', {
                orderId: orderNumber,
              })}
            />
          </div>
        </div>
        <Button
          type="button"
          variant={needsIntake && !recordDisabled ? 'default' : 'outline'}
          className={mobile ? 'h-11 sm:col-span-2' : 'h-11 shrink-0'}
          disabled={recordDisabled}
          aria-label={t('intake.recordForOrder', { orderId: orderNumber })}
          onClick={() => void onRecord()}
        >
          {state.busy && <Spinner data-icon="inline-start" />}
          {t('intake.record')}
        </Button>
      </div>
      <p
        id={helpId}
        className={
          state.invalid
            ? 'mt-1.5 text-xs text-destructive'
            : 'mt-1.5 text-xs text-muted-foreground'
        }
        aria-live={state.invalid ? 'polite' : undefined}
      >
        {helperText}
      </p>
    </div>
  );
}

function RecordedIntake({
  item,
}: Readonly<{ item: ProcessorOrderControlItem }>) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-sm font-medium">
        {t('common.bags', { count: item.order.bagCount ?? 0 })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('intake.intakeRecorded')}
      </p>
    </div>
  );
}

function AdmissionAction({
  item,
  busy,
  disabled,
  mobile = false,
  onDecision,
}: Readonly<{
  item: ProcessorOrderControlItem;
  busy: boolean;
  disabled: boolean;
  mobile?: boolean;
  onDecision: (target: 'released') => void;
}>) {
  const { t } = useTranslation();
  const orderNumber = presentIntakeOrderNumber(item);
  const canRelease = item.admission.allowedActions.includes('release');
  const actionClassName = mobile ? 'h-11 w-full' : 'h-11';
  const statusClassName = mobile
    ? 'flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground'
    : 'flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground';

  if (canRelease)
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Button
          type="button"
          className={actionClassName}
          disabled={disabled}
          aria-label={t('intake.releaseForOrder', { orderId: orderNumber })}
          onClick={() => onDecision('released')}
        >
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconPackageImport data-icon="inline-start" />
          )}
          {t('intake.release')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t('intake.awaitingReleaseStatus')}
        </p>
      </div>
    );

  if (item.order.status === 'intake_pending')
    return <p className={statusClassName}>{t('intake.finishIntake')}</p>;

  if (item.order.status === 'eligible')
    return (
      <p className={statusClassName}>
        <IconCircleCheck className="size-4 shrink-0" aria-hidden="true" />
        {t('intake.readyForProduction')}
      </p>
    );

  return <p className={statusClassName}>{t('intake.noActionAvailable')}</p>;
}

function DesktopIntakeTable(props: IntakeQueueProps) {
  const { t } = useTranslation();

  return (
    <div className="hidden overflow-hidden rounded-xl border bg-background 2xl:block">
      <Table className="table-fixed">
        <TableCaption className="sr-only">
          {t('intake.queueLabel')}
        </TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[23%] px-4">
              {t('intake.columns.order')}
            </TableHead>
            <TableHead className="w-[20%]">
              {t('intake.columns.source')}
            </TableHead>
            <TableHead className="w-[13%]">
              {t('intake.columns.demand')}
            </TableHead>
            <TableHead className="w-[26%]">
              {t('intake.columns.intake')}
            </TableHead>
            <TableHead className="w-[18%] px-4">
              {t('intake.columns.action')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.items.map((item) => {
            const state = rowStateFor(item, props);
            return (
              <TableRow key={item.order.id} className="hover:bg-transparent">
                <TableCell className="px-4 py-4 align-top whitespace-normal">
                  <OrderIdentity item={item} priority={state.priority} />
                </TableCell>
                <TableCell className="py-4 align-top whitespace-normal">
                  <SourceState item={item} />
                </TableCell>
                <TableCell className="py-4 align-top whitespace-normal">
                  <DemandAndDue item={item} />
                </TableCell>
                <TableCell className="py-4 align-top whitespace-normal">
                  {state.canRecord ? (
                    <IntakeControls
                      item={item}
                      state={state}
                      onBagCountChange={(value) =>
                        props.onBagCountChange(item.order.id, value)
                      }
                      onPriorityChange={(value) =>
                        props.onPriorityChange(item.order.id, value)
                      }
                      onRecord={() => props.onRecord(item)}
                    />
                  ) : (
                    <RecordedIntake item={item} />
                  )}
                </TableCell>
                <TableCell
                  className={`px-4 py-4 align-top whitespace-normal ${
                    state.canRecord ? 'pt-10' : ''
                  }`}
                >
                  <AdmissionAction
                    item={item}
                    busy={state.busy}
                    disabled={state.disabled}
                    onDecision={(target) => props.onDecision(item, target)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileIntakeCards(props: IntakeQueueProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-2 2xl:hidden">
      {props.items.map((item) => {
        const state = rowStateFor(item, props);
        const showAdmissionFooter =
          item.admission.allowedActions.includes('release') ||
          item.order.status === 'eligible';
        return (
          <Card key={item.order.id} className="gap-4 bg-background py-4">
            <CardContent className="flex flex-col gap-4 px-4">
              <OrderIdentity item={item} priority={state.priority} />
              <div className="grid grid-cols-2 gap-4 border-y py-4">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('intake.columns.source')}
                  </p>
                  <SourceState item={item} />
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('intake.columns.demand')}
                  </p>
                  <DemandAndDue item={item} />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t('intake.columns.intake')}
                </p>
                {state.canRecord ? (
                  <IntakeControls
                    item={item}
                    state={state}
                    mobile
                    onBagCountChange={(value) =>
                      props.onBagCountChange(item.order.id, value)
                    }
                    onPriorityChange={(value) =>
                      props.onPriorityChange(item.order.id, value)
                    }
                    onRecord={() => props.onRecord(item)}
                  />
                ) : (
                  <RecordedIntake item={item} />
                )}
              </div>
              {showAdmissionFooter && (
                <div className="border-t pt-4">
                  <AdmissionAction
                    item={item}
                    busy={state.busy}
                    disabled={state.disabled}
                    mobile
                    onDecision={(target) => props.onDecision(item, target)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function IntakeQueue(props: IntakeQueueProps) {
  return (
    <>
      <DesktopIntakeTable {...props} />
      <MobileIntakeCards {...props} />
    </>
  );
}
